import { useState, useEffect } from 'react';
import { SERVER_URL } from './config';

export function useRoom(): string | null {
    const [roomCode, setRoomCode] = useState<string | null>(() => {
        const path = window.location.pathname.replace(/^\//, '');
        return path || null;
    });

    useEffect(() => {
        if (roomCode) return;

        fetch(`${SERVER_URL}/new-room`)
            .then(res => res.json())
            .then((data: { room: string }) => {
                window.history.replaceState(null, '', `/${data.room}`);
                setRoomCode(data.room);
            });
    }, [roomCode]);

    return roomCode;
}
