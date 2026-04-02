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
  type RoomSettingsSummary,
  type TransferHostRequest,
  type TransferHostResponse,
  type UpdateRoomSettingsRequest,
  type UpdateRoomSettingsResponse,
} from 'shared';

interface RoomSummary {
  roomId: string;
  roomName: string;
  mode: RoomMode;
  maxPlayers: number;
  hasPassword: boolean;
}

function getRoomSummaryFromCache(cache: { roomId: string; metadata?: unknown }): RoomSummary | null {
  const metadata = cache.metadata as {
    roomName?: string;
    mode?: string;
    maxPlayers?: number;
    hasPassword?: boolean;
  } | undefined;

  if (!metadata?.roomName || !metadata.mode || !isRoomMode(metadata.mode)) {
    return null;
  }

  const maxPlayers = Number.isFinite(metadata.maxPlayers) ? Math.max(2, Math.floor(metadata.maxPlayers as number)) : 8;

  return {
    roomId: cache.roomId,
    roomName: metadata.roomName,
    mode: metadata.mode,
    maxPlayers,
    hasPassword: Boolean(metadata.hasPassword),
  };
}

function toRoomSettingsSummary(room: RoomSummary): RoomSettingsSummary {
  return {
    roomName: room.roomName,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    hasPassword: room.hasPassword,
    password: '',
  };
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<CreateRoomRequest>;
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
  const roomName = typeof payload.roomName === 'string' ? payload.roomName.trim() : '';
  const mode = payload.mode;

  if (!nickname || !roomName || !mode) {
    res.status(400).json({ error: 'nickname, roomName and mode are required.' });
    return;
  }

  if (!isRoomMode(mode)) {
    res.status(400).json({ error: 'Unsupported room mode.' });
    return;
  }

  const createdRoom = await matchMaker.createRoom('battle', {
    roomName,
    mode,
    hostNickname: nickname,
  });

  const playerToken = randomUUID();

  const seatReservation = await matchMaker.reserveSeatFor(createdRoom, {
    nickname,
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
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : undefined;

  if (!nickname || !roomId) {
    res.status(400).json({ error: 'nickname and roomId are required.' });
    return;
  }

  let roomCache;
  try {
    roomCache = await matchMaker.getRoomById(roomId);
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

  let seatReservation;
  try {
    seatReservation = await matchMaker.joinById(roomId, {
      nickname,
      password,
      playerToken,
    });
  } catch {
    res.status(403).json({ error: 'Failed to join room. Please check room password or room status.' });
    return;
  }

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

    const settings = (await matchMaker.remoteRoomCall(
      roomId,
      'getRoomSettingsSummary' as never,
    )) as RoomSettingsSummary;

    const response: GetRoomMembersResponse = {
      roomId,
      settings,
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

export async function updateRoomSettings(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<UpdateRoomSettingsRequest>;
  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
  const playerToken = typeof payload.playerToken === 'string' ? payload.playerToken.trim() : '';
  const roomName = typeof payload.roomName === 'string' ? payload.roomName : '';
  const mode = payload.mode;
  const maxPlayers = typeof payload.maxPlayers === 'number' ? payload.maxPlayers : NaN;
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (
    !roomId ||
    !sessionId ||
    !playerToken ||
    !roomName.trim() ||
    !mode ||
    !Number.isFinite(maxPlayers)
  ) {
    res
      .status(400)
      .json({ error: 'roomId, sessionId, playerToken, roomName, mode, maxPlayers and password are required.' });
    return;
  }

  if (!isRoomMode(mode)) {
    res.status(400).json({ error: 'Unsupported room mode.' });
    return;
  }

  try {
    const result = (await matchMaker.remoteRoomCall(
      roomId,
      'updateRoomSettings' as never,
      [
        sessionId,
        playerToken,
        {
          roomName,
          mode,
          maxPlayers,
          password,
        },
      ] as never,
    )) as { ok: boolean; error?: string; settings?: RoomSettingsSummary };

    if (!result.ok || !result.settings) {
      res.status(403).json({ error: result.error ?? 'Failed to update room settings.' });
      return;
    }

    const response: UpdateRoomSettingsResponse = {
      roomId,
      settings: result.settings,
    };

    res.status(200).json(response);
  } catch {
    res.status(404).json({ error: 'Room not found.' });
  }
}

export async function transferHost(req: Request, res: Response): Promise<void> {
  const payload = req.body as Partial<TransferHostRequest>;
  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
  const playerToken = typeof payload.playerToken === 'string' ? payload.playerToken.trim() : '';
  const targetSessionId = typeof payload.targetSessionId === 'string' ? payload.targetSessionId.trim() : '';

  if (!roomId || !sessionId || !playerToken || !targetSessionId) {
    res.status(400).json({ error: 'roomId, sessionId, playerToken and targetSessionId are required.' });
    return;
  }

  try {
    const result = (await matchMaker.remoteRoomCall(
      roomId,
      'transferHost' as never,
      [sessionId, playerToken, targetSessionId] as never,
    )) as { ok: boolean; error?: string; hostSessionId?: string };

    if (!result.ok || !result.hostSessionId) {
      res.status(403).json({ error: result.error ?? 'Failed to transfer host.' });
      return;
    }

    const response: TransferHostResponse = {
      roomId,
      hostSessionId: result.hostSessionId,
    };

    res.status(200).json(response);
  } catch {
    res.status(404).json({ error: 'Room not found.' });
  }
}
