import { matchMaker } from 'colyseus';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  isRoomMode,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type GetRoomMembersResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type LeaveRoomRequest,
  type LeaveRoomResponse,
  type RoomMemberSummary,
  type RoomMode,
} from 'shared';

interface RoomSummary {
  roomId: string;
  roomName: string;
  mode: RoomMode;
}

function getRoomSummaryFromCache(cache: { roomId: string; metadata?: unknown }): RoomSummary | null {
  const metadata = cache.metadata as { roomName?: string; mode?: string } | undefined;

  if (!metadata?.roomName || !metadata.mode || !isRoomMode(metadata.mode)) {
    return null;
  }

  return {
    roomId: cache.roomId,
    roomName: metadata.roomName,
    mode: metadata.mode,
  };
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<CreateRoomRequest>;

  if (!payload.nickname || !payload.roomName || !payload.mode) {
    res.status(400).json({ error: 'nickname, roomName and mode are required.' });
    return;
  }

  if (!isRoomMode(payload.mode)) {
    res.status(400).json({ error: 'Unsupported room mode.' });
    return;
  }

  const createdRoom = await matchMaker.createRoom('battle', {
    roomName: payload.roomName,
    mode: payload.mode,
    hostNickname: payload.nickname,
  });

  const playerToken = randomUUID();

  const seatReservation = await matchMaker.reserveSeatFor(createdRoom, {
    nickname: payload.nickname,
    playerToken,
  });

  const room = getRoomSummaryFromCache(createdRoom);
  if (!room) {
    res.status(500).json({ error: 'Invalid room metadata.' });
    return;
  }

  const response: CreateRoomResponse = {
    room,
    seatReservation,
    playerToken,
  };

  res.status(201).json(response);
}

export async function joinRoom(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<JoinRoomRequest>;

  if (!payload.nickname || !payload.roomId) {
    res.status(400).json({ error: 'nickname and roomId are required.' });
    return;
  }

  let roomCache;
  try {
    roomCache = await matchMaker.getRoomById(payload.roomId);
  } catch {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  const room = getRoomSummaryFromCache(roomCache);
  if (!room) {
    res.status(500).json({ error: 'Invalid room metadata.' });
    return;
  }

  const playerToken = randomUUID();

  const seatReservation = await matchMaker.joinById(payload.roomId, {
    nickname: payload.nickname,
    password: payload.password,
    playerToken,
  });

  const response: JoinRoomResponse = {
    room,
    seatReservation,
    playerToken,
  };

  res.status(200).json(response);
}

export async function getRoomMembers(req: Request, res: Response): Promise<void> {
  const rawRoomId = req.params.roomId;
  const roomId = Array.isArray(rawRoomId) ? rawRoomId[0]?.trim() : rawRoomId?.trim();

  if (!roomId) {
    res.status(400).json({ error: 'roomId is required.' });
    return;
  }

  try {
    const members = (await matchMaker.remoteRoomCall(
      roomId,
      'getPlayersSummary' as never,
    )) as RoomMemberSummary[];

    const response: GetRoomMembersResponse = {
      roomId,
      members,
    };

    res.status(200).json(response);
  } catch {
    res.status(404).json({ error: 'Room not found.' });
  }
}

export async function leaveRoom(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<LeaveRoomRequest>;

  if (!payload.roomId || !payload.sessionId || !payload.playerToken) {
    res.status(400).json({ error: 'roomId, sessionId and playerToken are required.' });
    return;
  }

  try {
    const left = (await matchMaker.remoteRoomCall(
      payload.roomId,
      'removePlayerBySessionId' as never,
      [payload.sessionId, payload.playerToken] as never,
    )) as boolean;

    const response: LeaveRoomResponse = {
      roomId: payload.roomId,
      left,
    };

    if (!left) {
      res.status(404).json({ error: 'Player not found in room.' });
      return;
    }

    res.status(200).json(response);
  } catch {
    res.status(404).json({ error: 'Room not found.' });
  }
}
