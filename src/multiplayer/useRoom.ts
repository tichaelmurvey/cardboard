import { useState, useEffect } from 'react';
import { SERVER_URL } from './config';

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, ''); // e.g. "" or "/cardboard"

export function useRoom(): string | null {
    const [roomCode, setRoomCode] = useState<string | null>(() => {
        const path = window.location.pathname
            .replace(new RegExp(`^${BASE_PATH}`), '')
            .replace(/^\//, '');
        return path || null;
    });

    useEffect(() => {
        if (roomCode) return;

        fetch(`${SERVER_URL}/new-room`)
            .then(res => res.json())
            .then((data: { room: string }) => {
                window.history.replaceState(null, '', `${BASE_PATH}/${data.room}`);
                setRoomCode(data.room);
            });
    }, [roomCode]);

    return roomCode;
}
