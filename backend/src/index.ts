import http from 'node:http';
import { Server, WebSocketTransport } from 'colyseus';
import cors from 'cors';
import express from 'express';
import { createRoom, getRoomMembers, joinRoom, leaveRoom } from './api/roomRoutes.js';
import { BattleRoom } from './game/BattleRoom.js';

const port = Number(process.env.PORT ?? 2567);
const app = express();

app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('battle', BattleRoom);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/rooms', async (req, res) => {
  try {
    await createRoom(req, res);
  } catch (error) {
    console.error('Failed to create room', error);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

app.post('/api/rooms/join', async (req, res) => {
  try {
    await joinRoom(req, res);
  } catch (error) {
    console.error('Failed to join room', error);
    res.status(500).json({ error: 'Failed to join room.' });
  }
});

app.get('/api/rooms/:roomId/members', async (req, res) => {
  try {
    await getRoomMembers(req, res);
  } catch (error) {
    console.error('Failed to get room members', error);
    res.status(500).json({ error: 'Failed to get room members.' });
  }
});

app.post('/api/rooms/leave', async (req, res) => {
  try {
    await leaveRoom(req, res);
  } catch (error) {
    console.error('Failed to leave room', error);
    res.status(500).json({ error: 'Failed to leave room.' });
  }
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on :${port}`);
});
