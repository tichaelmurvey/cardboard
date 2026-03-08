import { createServer } from 'http';
import { Server } from 'socket.io';
const PORT = parseInt(process.env.PORT || '3003', 10);
const CLEANUP_DELAY_MS = 30 * 60 * 1000;
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
const rooms = new Map();
function generateRoomCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++)
        code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}
function getOrCreateRoom(roomCode) {
    let room = rooms.get(roomCode);
    if (!room) {
        room = { state: null, hostId: null, cleanupTimer: null };
        rooms.set(roomCode, room);
    }
    if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }
    return room;
}
async function getRoomMemberIds(roomCode) {
    const sockets = await io.in(roomCode).fetchSockets();
    return sockets.map(s => s.id);
}
io.on('connection', (socket) => {
    let currentRoom = null;
    let clientId = null;
    socket.on('room:join', async (roomCode, cid) => {
        currentRoom = roomCode;
        clientId = cid;
        socket.join(roomCode);
        const room = getOrCreateRoom(roomCode);
        console.log(`Client ${socket.id} (${cid}) joined room ${roomCode}`);
        if (room.state) {
            socket.emit('state:full', room.state);
        }
        // Assign host if none
        if (!room.hostId) {
            room.hostId = socket.id;
            console.log(`Client ${socket.id} is now host of room ${roomCode}`);
        }
        // Tell everyone in the room who the host is
        io.to(roomCode).emit('room:host', room.hostId);
    });
    socket.on('player:claim', (name) => {
        if (!currentRoom || !clientId)
            return;
        const room = rooms.get(currentRoom);
        if (!room?.state)
            return;
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
        io.to(currentRoom).emit('state:full', room.state);
        socket.emit('player:assigned', player.id);
        console.log(`Client ${clientId} claimed player ${player.id} as "${name}" in room ${currentRoom}`);
    });
    socket.on('state:update', (newState) => {
        if (!currentRoom)
            return;
        const room = rooms.get(currentRoom);
        if (!room)
            return;
        room.state = newState;
        socket.to(currentRoom).emit('state:full', newState);
    });
    socket.on('disconnect', async () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (!currentRoom)
            return;
        const room = rooms.get(currentRoom);
        if (!room)
            return;
        const memberIds = await getRoomMemberIds(currentRoom);
        if (memberIds.length === 0) {
            // All players left — schedule cleanup
            console.log(`Room ${currentRoom} is empty, scheduling cleanup in 30 minutes`);
            const roomCode = currentRoom;
            room.hostId = null;
            room.cleanupTimer = setTimeout(() => {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted after timeout`);
            }, CLEANUP_DELAY_MS);
            return;
        }
        // Reassign host if the host left
        if (room.hostId === socket.id) {
            room.hostId = memberIds[0];
            console.log(`New host for room ${currentRoom}: ${room.hostId}`);
            io.to(currentRoom).emit('room:host', room.hostId);
        }
    });
});
httpServer.listen(PORT, () => {
    console.log(`Cardboard server listening on port ${PORT}`);
});
