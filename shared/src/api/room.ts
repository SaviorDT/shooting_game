export const ROOM_MODE_OPTIONS = [
  { id: 'classic', label: '經典對戰' },
] as const;

export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 12;

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
    maxPlayers: number;
    hasPassword: boolean;
  };
  seatReservation: SeatReservationPayload;
  playerToken: string;
}

export interface JoinRoomResponse {
  room: {
    roomId: string;
    roomName: string;
    mode: RoomMode;
    maxPlayers: number;
    hasPassword: boolean;
  };
  seatReservation: SeatReservationPayload;
  playerToken: string;
}

export interface RoomSettingsSummary {
  roomName: string;
  mode: RoomMode;
  maxPlayers: number;
  hasPassword: boolean;
  password: string;
}

export interface RoomMemberSummary {
  sessionId: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export interface GetRoomMembersResponse {
  roomId: string;
  settings: RoomSettingsSummary;
  members: RoomMemberSummary[];
}

export interface LeaveRoomRequest {
  roomId: string;
  sessionId: string;
  playerToken: string;
}

export interface LeaveRoomResponse {
  roomId: string;
  left: boolean;
}

export interface UpdateRoomSettingsRequest {
  roomId: string;
  sessionId: string;
  playerToken: string;
  roomName: string;
  mode: RoomMode;
  maxPlayers: number;
  password: string;
}

export interface UpdateRoomSettingsResponse {
  roomId: string;
  settings: RoomSettingsSummary;
}

export interface TransferHostRequest {
  roomId: string;
  sessionId: string;
  playerToken: string;
  targetSessionId: string;
}

export interface TransferHostResponse {
  roomId: string;
  hostSessionId: string;
}
