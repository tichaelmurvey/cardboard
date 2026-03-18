import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CanvasState } from '../state_management/types';
import { instancesToArray, instancesToMap } from '../state_management/types';
import { getClientId } from './clientId';
import { SERVER_URL } from './config';

const THROTTLE_MS = 50;

export function useMultiplayer(
    roomCode: string,
    state: CanvasState,
    setState: (state: CanvasState) => void,
): { isHost: boolean; assignedPlayerId: string | null; claimPlayer: (name: string) => void } {
    const socketRef = useRef<Socket | null>(null);
    const receivedStateRef = useRef<CanvasState | null>(null);
    const lastSentRef = useRef(0);
    const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [assignedPlayerId, setAssignedPlayerId] = useState<string | null>(null);
    const [clientId] = useState(getClientId);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; });

    useEffect(() => {
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        let receivedInitialState = false;

        socket.on('connect', () => {
            socket.emit('room:join', roomCode, clientId);
            // Give the server a moment to send existing state; if none arrives, push ours
            setTimeout(() => {
                if (!receivedInitialState) {
                    socket.emit('state:update', { ...stateRef.current, instances: instancesToArray(stateRef.current.instances) });
                }
            }, 500);
        });

        socket.on('state:full', (serverState: CanvasState & { instances: unknown }) => {
            // Server sends instances as an array (JSON); convert to Map
            const hydrated: CanvasState = {
                ...serverState,
                instances: Array.isArray(serverState.instances)
                    ? instancesToMap(serverState.instances as import('../state_management/types').Instance[])
                    : serverState.instances as Map<string, import('../state_management/types').Instance>,
            };
            receivedInitialState = true;
            receivedStateRef.current = hydrated;
            setState(hydrated);

            // Check if we're already claimed in the received state
            const claimed = hydrated.players.find(p => p.claimedBy === clientId);
            if (claimed) setAssignedPlayerId(claimed.id);
        });

        socket.on('room:host', (hostId: string) => {
            setIsHost(socket.id === hostId);
        });

        socket.on('player:assigned', (playerId: string) => {
            setAssignedPlayerId(playerId);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
            if (pendingRef.current) clearTimeout(pendingRef.current);
        };
    }, [roomCode, setState, clientId]);

    const sendUpdate = useCallback((newState: CanvasState) => {
        const socket = socketRef.current;
        if (!socket?.connected) return;

        // Convert Map to array for JSON serialization over the wire
        const wire = { ...newState, instances: instancesToArray(newState.instances) };

        const now = Date.now();
        const elapsed = now - lastSentRef.current;

        if (pendingRef.current) {
            clearTimeout(pendingRef.current);
            pendingRef.current = null;
        }

        if (elapsed >= THROTTLE_MS) {
            socket.emit('state:update', wire);
            lastSentRef.current = now;
        } else {
            pendingRef.current = setTimeout(() => {
                socket.emit('state:update', wire);
                lastSentRef.current = Date.now();
                pendingRef.current = null;
            }, THROTTLE_MS - elapsed);
        }
    }, []);

    useEffect(() => {
        if (state === receivedStateRef.current) {
            receivedStateRef.current = null;
            return;
        }
        receivedStateRef.current = null;
        sendUpdate(state);
    }, [state, sendUpdate]);

    const claimPlayer = useCallback((name: string) => {
        socketRef.current?.emit('player:claim', name);
    }, []);

    return { isHost, assignedPlayerId, claimPlayer };
}
