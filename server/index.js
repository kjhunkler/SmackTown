import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOM_MEMBERS = 4;

const wss = new WebSocketServer({ port: PORT });

/** @type {Map<import('ws').WebSocket, {clientId: string, username: string, roomId: string|null}>} */
const clientsBySocket = new Map();
/** @type {Map<string, import('ws').WebSocket>} */
const socketsByClientId = new Map();
/** @type {Map<string, {code: string, members: Map<string, {username: string, ready: boolean, build: unknown|null}>}>} */
const rooms = new Map();
/** @type {Map<string, string>} */
const codeToRoomId = new Map();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (codeToRoomId.has(code));
  return code;
}

function presenceList() {
  return [...clientsBySocket.values()].map((c) => ({
    clientId: c.clientId,
    username: c.username,
    status: c.roomId ? 'in-room' : 'online',
  }));
}

function broadcastPresence() {
  const list = presenceList();
  for (const ws of clientsBySocket.keys()) {
    send(ws, { t: 'presence:update', users: list });
  }
}

function roomState(room, roomId) {
  return {
    roomId,
    code: room.code,
    members: [...room.members.entries()].map(([clientId, m]) => ({
      clientId,
      username: m.username,
      ready: m.ready,
      build: m.build,
    })),
  };
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const state = roomState(room, roomId);
  for (const clientId of room.members.keys()) {
    const ws = socketsByClientId.get(clientId);
    if (ws) send(ws, { t: 'room:update', room: state });
  }
}

function leaveRoom(clientId) {
  const client = [...clientsBySocket.values()].find((c) => c.clientId === clientId);
  const roomId = client?.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    room.members.delete(clientId);
    if (room.members.size === 0) {
      rooms.delete(roomId);
      codeToRoomId.delete(room.code);
    } else {
      broadcastRoom(roomId);
    }
  }
  if (client) client.roomId = null;
}

function maybeStartMatch(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const members = [...room.members.entries()];
  if (members.length < 2) return;
  const allReady = members.every(([, m]) => m.ready && m.build);
  if (!allReady) return;

  const startAt = Date.now() + 2200;
  const players = members.map(([clientId, m]) => ({ clientId, username: m.username, build: m.build }));

  for (const [clientId] of members) {
    const ws = socketsByClientId.get(clientId);
    if (ws) send(ws, { t: 'match:start', roomId, players, startAt });
    const client = [...clientsBySocket.values()].find((c) => c.clientId === clientId);
    if (client) client.roomId = null;
  }

  rooms.delete(roomId);
  codeToRoomId.delete(room.code);
  broadcastPresence();
}

wss.on('connection', (ws) => {
  clientsBySocket.set(ws, { clientId: '', username: '', roomId: null });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const client = clientsBySocket.get(ws);
    if (!client) return;

    switch (msg.t) {
      case 'register': {
        if (typeof msg.clientId !== 'string' || typeof msg.username !== 'string') return;
        const previousSocket = socketsByClientId.get(msg.clientId);
        if (previousSocket && previousSocket !== ws) {
          previousSocket.close();
        }
        client.clientId = msg.clientId;
        client.username = msg.username.slice(0, 16);
        socketsByClientId.set(msg.clientId, ws);
        send(ws, { t: 'registered', clientId: msg.clientId });
        broadcastPresence();
        break;
      }
      case 'presence:subscribe': {
        send(ws, { t: 'presence:update', users: presenceList() });
        break;
      }
      case 'room:create': {
        if (!client.clientId) return;
        leaveRoom(client.clientId);
        const roomId = randomUUID();
        const code = makeRoomCode();
        rooms.set(roomId, { code, members: new Map([[client.clientId, { username: client.username, ready: false, build: null }]]) });
        codeToRoomId.set(code, roomId);
        client.roomId = roomId;
        broadcastRoom(roomId);
        broadcastPresence();
        break;
      }
      case 'room:join': {
        if (!client.clientId || typeof msg.code !== 'string') return;
        const roomId = codeToRoomId.get(msg.code.toUpperCase());
        const room = roomId ? rooms.get(roomId) : undefined;
        if (!room || !roomId) {
          send(ws, { t: 'room:error', message: 'Room not found.' });
          return;
        }
        if (room.members.size >= MAX_ROOM_MEMBERS) {
          send(ws, { t: 'room:error', message: 'Room is full.' });
          return;
        }
        leaveRoom(client.clientId);
        room.members.set(client.clientId, { username: client.username, ready: false, build: null });
        client.roomId = roomId;
        broadcastRoom(roomId);
        broadcastPresence();
        break;
      }
      case 'room:leave': {
        if (!client.clientId) return;
        leaveRoom(client.clientId);
        send(ws, { t: 'room:closed' });
        broadcastPresence();
        break;
      }
      case 'room:invite': {
        if (!client.clientId || !client.roomId || typeof msg.targetClientId !== 'string') return;
        const room = rooms.get(client.roomId);
        const targetWs = socketsByClientId.get(msg.targetClientId);
        if (room && targetWs) {
          send(targetWs, { t: 'room:invited', fromClientId: client.clientId, fromUsername: client.username, code: room.code });
        }
        break;
      }
      case 'room:ready': {
        if (!client.clientId || !client.roomId) return;
        const room = rooms.get(client.roomId);
        const member = room?.members.get(client.clientId);
        if (!room || !member) return;
        member.ready = !!msg.ready;
        member.build = msg.build ?? null;
        broadcastRoom(client.roomId);
        maybeStartMatch(client.roomId);
        break;
      }
      case 'signal': {
        if (!client.clientId || typeof msg.to !== 'string') return;
        const targetWs = socketsByClientId.get(msg.to);
        if (targetWs) send(targetWs, { t: 'signal', from: client.clientId, data: msg.data });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    const client = clientsBySocket.get(ws);
    if (client?.clientId) {
      leaveRoom(client.clientId);
      if (socketsByClientId.get(client.clientId) === ws) {
        socketsByClientId.delete(client.clientId);
      }
    }
    clientsBySocket.delete(ws);
    broadcastPresence();
  });
});

console.log(`SmackTown signaling server listening on ws://localhost:${PORT}`);
