import { createServer } from 'http';
import { Server } from 'socket.io';
import type { CanvasState } from '../src/state_management/types.ts';

const PORT = parseInt(process.env.PORT || '3003', 10);
const CLEANUP_DELAY_MS = 30 * 60 * 1000;

interface Room {
    state: CanvasState | null;
    hostId: string | null;
    hostClientId: string | null;
    cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/new-room') {
        const code = generateRoomCode();
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ room: code }));
        return;
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    res.writeHead(404);
    res.end();
});

const io = new Server(httpServer, {
    cors: { origin: '*' },
});

const rooms = new Map<string, Room>();
const socketToClientId = new Map<string, string>();

function generateRoomCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function getOrCreateRoom(roomCode: string): Room {
    let room = rooms.get(roomCode);
    if (!room) {
        room = { state: null, hostId: null, hostClientId: null, cleanupTimer: null };
        rooms.set(roomCode, room);
    }
    if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }
    return room;
}

/** Stamp hostClientId onto the state before sending */
function stampState(room: Room) {
    if (room.state) {
        room.state.hostClientId = room.hostClientId ?? undefined;
    }
}

async function getRoomMemberIds(roomCode: string): Promise<string[]> {
    const sockets = await io.in(roomCode).fetchSockets();
    return sockets.map(s => s.id);
}

io.on('connection', (socket) => {
    let currentRoom: string | null = null;
    let clientId: string | null = null;

    socket.on('room:join', async (roomCode: string, cid: string) => {
        currentRoom = roomCode;
        clientId = cid;
        socketToClientId.set(socket.id, cid);
        socket.join(roomCode);
        const room = getOrCreateRoom(roomCode);

        console.log(`Client ${socket.id} (${cid}) joined room ${roomCode}`);

        // Assign host if none
        if (!room.hostId) {
            room.hostId = socket.id;
            room.hostClientId = cid;
            console.log(`Client ${socket.id} is now host of room ${roomCode}`);
        }

        // Tell everyone who the host socket is (for isHost determination)
        io.to(roomCode).emit('room:host', room.hostId);

        // Send existing state (with hostClientId stamped) to the joining client
        if (room.state) {
            stampState(room);
            socket.emit('state:full', room.state);
        }
    });

    socket.on('player:claim', (name: string) => {
        if (!currentRoom || !clientId) return;
        const room = rooms.get(currentRoom);
        if (!room?.state) return;

        // Check if already claimed
        const already = room.state.players.find(p => p.claimedBy === clientId);
        if (already) {
            socket.emit('player:assigned', already.id);
            return;
        }

        // Find first unclaimed player
        const player = room.state.players.find(p => !p.claimedBy);
        if (!player) {
            socket.emit('player:full');
            return;
        }

        player.name = name;
        player.claimedBy = clientId;

        // Broadcast updated state to all clients
        stampState(room);
        io.to(currentRoom).emit('state:full', room.state);
        socket.emit('player:assigned', player.id);
        console.log(`Client ${clientId} claimed player ${player.id} as "${name}" in room ${currentRoom}`);
    });

    socket.on('state:update', (newState: CanvasState) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        room.state = newState;
        stampState(room);
        socket.to(currentRoom).emit('state:full', room.state);
    });

    socket.on('disconnect', async () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (!currentRoom) return;

        const room = rooms.get(currentRoom);
        if (!room) return;

        const memberIds = await getRoomMemberIds(currentRoom);

        if (memberIds.length === 0) {
            // All players left — schedule cleanup
            console.log(`Room ${currentRoom} is empty, scheduling cleanup in 30 minutes`);
            const roomCode = currentRoom;
            room.hostId = null;
            room.hostClientId = null;
            room.cleanupTimer = setTimeout(() => {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted after timeout`);
            }, CLEANUP_DELAY_MS);
            return;
        }

        // Reassign host if the host left
        if (room.hostId === socket.id) {
            room.hostId = memberIds[0];
            room.hostClientId = socketToClientId.get(memberIds[0]) ?? null;
            console.log(`New host for room ${currentRoom}: ${room.hostId}`);
            // Broadcast new host socket id
            io.to(currentRoom).emit('room:host', room.hostId);
            // Broadcast state with updated hostClientId
            if (room.state) {
                stampState(room);
                io.to(currentRoom).emit('state:full', room.state);
            }
        }
        socketToClientId.delete(socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Cardboard server listening on port ${PORT}`);
});
