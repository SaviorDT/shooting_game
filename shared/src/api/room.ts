export const ROOM_MODE_OPTIONS = [
  { id: 'classic', label: '經典對戰' },
  { id: 'team_deathmatch', label: '團隊死鬥' },
  { id: 'domination', label: '佔點模式' },
] as const;

export type RoomMode = (typeof ROOM_MODE_OPTIONS)[number]['id'];

export const ROOM_MODES: readonly RoomMode[] = ROOM_MODE_OPTIONS.map((mode) => mode.id);

export function isRoomMode(mode: string): mode is RoomMode {
  return ROOM_MODES.includes(mode as RoomMode);
}

export function getRoomModeLabel(mode: RoomMode): string {
  const option = ROOM_MODE_OPTIONS.find((item) => item.id === mode);
  return option?.label ?? mode;
}

export interface CreateRoomRequest {
  nickname: string;
  roomName: string;
  mode: RoomMode;
}

export interface JoinRoomRequest {
  nickname: string;
  roomId: string;
  password?: string;
}

export interface SeatReservationPayload {
  name: string;
  roomId: string;
  sessionId: string;
  publicAddress?: string;
  processId?: string;
  reconnectionToken?: string;
  devMode?: boolean;
}

export interface CreateRoomResponse {
  room: {
    roomId: string;
    roomName: string;
    mode: RoomMode;
  };
  seatReservation: SeatReservationPayload;
}

export interface JoinRoomResponse {
  room: {
    roomId: string;
    roomName: string;
    mode: RoomMode;
  };
  seatReservation: SeatReservationPayload;
}

export interface RoomMemberSummary {
  sessionId: string;
  nickname: string;
  isHost: boolean;
}

export interface GetRoomMembersResponse {
  roomId: string;
  members: RoomMemberSummary[];
}

export interface LeaveRoomRequest {
  roomId: string;
  sessionId: string;
}

export interface LeaveRoomResponse {
  roomId: string;
  left: boolean;
}
