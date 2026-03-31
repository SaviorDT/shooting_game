import { Client } from '@colyseus/sdk';
import {
  type CreateRoomResponse,
  type GetRoomMembersResponse,
  type JoinRoomResponse,
  type LeaveRoomResponse,
  type RoomMemberSummary,
  type RoomMode,
} from 'shared';

interface LeaveCapableRoom {
  leave: (consented?: boolean) => Promise<unknown> | unknown;
}

export interface JoinedRoomView {
  roomId: string;
  roomName: string;
  mode: RoomMode;
  sessionId: string;
  playerToken: string;
  nickname: string;
  isHost: boolean;
}

let currentRoom: LeaveCapableRoom | null = null;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;

if (!apiBaseUrl || !wsBaseUrl) {
  throw new Error('Missing required env: VITE_API_BASE_URL / VITE_WS_BASE_URL');
}

function toErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue;
    }
  }

  return fallbackMessage;
}

async function consumeSeatReservationAndStore(
  seatReservation: CreateRoomResponse['seatReservation'] | JoinRoomResponse['seatReservation'],
): Promise<void> {
  const client = new Client(wsBaseUrl);
  const joinedRoom = await client.consumeSeatReservation(seatReservation);
  currentRoom = joinedRoom;
}

export async function createRoom(params: {
  nickname: string;
  roomName: string;
  mode: RoomMode;
}): Promise<JoinedRoomView> {
  const response = await fetch(`${apiBaseUrl}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(toErrorMessage(payload, '創建房間失敗，請稍後再試。'));
  }

  const payload = (await response.json()) as CreateRoomResponse;
  await consumeSeatReservationAndStore(payload.seatReservation);

  return {
    roomId: payload.room.roomId,
    roomName: payload.room.roomName,
    mode: payload.room.mode,
    sessionId: payload.seatReservation.sessionId,
    playerToken: payload.playerToken,
    nickname: params.nickname,
    isHost: true,
  };
}

export async function joinRoom(params: {
  nickname: string;
  roomId: string;
  password?: string;
}): Promise<JoinedRoomView> {
  const response = await fetch(`${apiBaseUrl}/api/rooms/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(toErrorMessage(payload, '加入房間失敗，請稍後再試。'));
  }

  const payload = (await response.json()) as JoinRoomResponse;
  await consumeSeatReservationAndStore(payload.seatReservation);

  return {
    roomId: payload.room.roomId,
    roomName: payload.room.roomName,
    mode: payload.room.mode,
    sessionId: payload.seatReservation.sessionId,
    playerToken: payload.playerToken,
    nickname: params.nickname,
    isHost: false,
  };
}

export async function leaveRoom(params: {
  roomId: string;
  sessionId: string;
  playerToken: string;
}): Promise<void> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/rooms/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as unknown;
      throw new Error(toErrorMessage(payload, '離開房間失敗，請稍後再試。'));
    }

    await response.json().catch(() => null as LeaveRoomResponse | null);
  } finally {
    const room = currentRoom;
    currentRoom = null;

    if (room) {
      await room.leave(true);
    }
  }
}

export async function getRoomMembers(roomId: string): Promise<RoomMemberSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/members`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(toErrorMessage(payload, '取得房間成員失敗，請稍後再試。'));
  }

  const payload = (await response.json()) as GetRoomMembersResponse;
  return payload.members;
}
