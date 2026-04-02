import { Client, Room } from 'colyseus';
import { isRoomMode, ROOM_MAX_PLAYERS, ROOM_MIN_PLAYERS, type RoomMode } from 'shared';

interface BattleRoomOptions {
  roomName: string;
  mode: RoomMode;
  hostNickname: string;
}

interface PlayerJoinOptions {
  nickname?: string;
  playerToken?: string;
  password?: string;
}

interface RoomPlayer {
  sessionId: string;
  nickname: string;
  isHost: boolean;
  playerToken: string;
}

export class BattleRoom extends Room {
  maxClients = 8;
  private hostSessionId: string | null = null;
  private hostNickname = 'Host';
  private currentRoomName = 'Battle Room';
  private currentRoomMode: RoomMode = 'classic';
  private roomPassword = '';
  private readonly players = new Map<string, RoomPlayer>();

  onCreate(options: BattleRoomOptions): void {
    this.currentRoomName = options.roomName.trim();
    this.currentRoomMode = options.mode;
    this.roomPassword = '';
    this.maxClients = this.sanitizeMaxPlayers(undefined);
    this.hostNickname = options.hostNickname;

    void this.setMetadata(this.buildMetadata());
  }

  onAuth(_client: Client, options?: PlayerJoinOptions): boolean {
    if (!this.roomPassword) {
      return true;
    }

    return (options?.password?.trim() ?? '') === this.roomPassword;
  }

  onJoin(client: Client, options?: PlayerJoinOptions): void {
    const isHost = this.hostSessionId === null;
    if (isHost) {
      this.hostSessionId = client.sessionId;
    }

    this.players.set(client.sessionId, {
      sessionId: client.sessionId,
      nickname: options?.nickname ?? 'Player',
      isHost,
      playerToken: options?.playerToken ?? '',
    });

    client.send('room.joined', {
      roomId: this.roomId,
      nickname: options?.nickname ?? 'Player',
    });
  }

  async onLeave(client: Client): Promise<void> {
    this.players.delete(client.sessionId);

    if (this.players.size === 0) {
      this.hostSessionId = null;
      await this.disconnect();
      return;
    }

    if (this.hostSessionId !== client.sessionId) {
      return;
    }

    this.hostSessionId = null;

    const nextPlayer = this.players.values().next().value as RoomPlayer | undefined;
    if (!nextPlayer) {
      return;
    }

    nextPlayer.isHost = true;
    this.hostSessionId = nextPlayer.sessionId;
    this.players.set(nextPlayer.sessionId, nextPlayer);

    this.hostNickname = nextPlayer.nickname;
    await this.setMetadata(this.buildMetadata());
  }

  onDispose(): void {
    // Reserved for future room cleanup.
  }

  getPlayersSummary(): RoomPlayer[] {
    return Array.from(this.players.values());
  }

  getRoomSettingsSummary(): {
    roomName: string;
    mode: RoomMode;
    maxPlayers: number;
    hasPassword: boolean;
    password: string;
  } {
    return {
      roomName: this.currentRoomName,
      mode: this.currentRoomMode,
      maxPlayers: this.maxClients,
      hasPassword: Boolean(this.roomPassword),
      password: this.roomPassword,
    };
  }

  async updateRoomSettings(
    sessionId: string,
    playerToken: string,
    nextSettings: { roomName: string; mode: string; maxPlayers: number; password: string },
  ): Promise<
    | {
        ok: true;
        settings: { roomName: string; mode: RoomMode; maxPlayers: number; hasPassword: boolean; password: string };
      }
    | { ok: false; error: string }
  > {
    const actor = this.players.get(sessionId);

    if (!actor || actor.playerToken !== playerToken) {
      return { ok: false, error: 'Unauthorized player.' };
    }

    if (!actor.isHost) {
      return { ok: false, error: 'Only host can update room settings.' };
    }

    const roomName = nextSettings.roomName.trim();
    if (!roomName) {
      return { ok: false, error: 'Room name cannot be empty.' };
    }

    if (!isRoomMode(nextSettings.mode)) {
      return { ok: false, error: 'Unsupported room mode.' };
    }

    const maxPlayers = this.sanitizeMaxPlayers(nextSettings.maxPlayers);

    if (maxPlayers < this.players.size) {
      return { ok: false, error: 'maxPlayers cannot be lower than current players.' };
    }

    this.currentRoomName = roomName;
    this.currentRoomMode = nextSettings.mode;
    this.maxClients = maxPlayers;
    this.roomPassword = nextSettings.password.trim();

    await this.setMetadata(this.buildMetadata());

    return {
      ok: true,
      settings: this.getRoomSettingsSummary(),
    };
  }

  async transferHost(
    sessionId: string,
    playerToken: string,
    targetSessionId: string,
  ): Promise<{ ok: true; hostSessionId: string } | { ok: false; error: string }> {
    const actor = this.players.get(sessionId);
    if (!actor || actor.playerToken !== playerToken) {
      return { ok: false, error: 'Unauthorized player.' };
    }

    if (!actor.isHost) {
      return { ok: false, error: 'Only host can transfer host role.' };
    }

    if (sessionId === targetSessionId) {
      return { ok: false, error: 'Target player is already host.' };
    }

    const target = this.players.get(targetSessionId);
    if (!target) {
      return { ok: false, error: 'Target player not found.' };
    }

    actor.isHost = false;
    target.isHost = true;
    this.hostSessionId = target.sessionId;
    this.hostNickname = target.nickname;

    this.players.set(actor.sessionId, actor);
    this.players.set(target.sessionId, target);

    await this.setMetadata(this.buildMetadata());

    return { ok: true, hostSessionId: target.sessionId };
  }

  removePlayerBySessionId(sessionId: string, playerToken: string): boolean {
    const player = this.players.get(sessionId);
    if (!player || player.playerToken !== playerToken) {
      return false;
    }

    const targetClient = this.clients.find((client) => client.sessionId === sessionId);
    if (!targetClient) {
      return false;
    }

    targetClient.leave(1000);
    return true;
  }

  private sanitizeMaxPlayers(maxPlayers: number | undefined): number {
    if (typeof maxPlayers !== 'number' || !Number.isFinite(maxPlayers)) {
      return 8;
    }

    return Math.min(ROOM_MAX_PLAYERS, Math.max(ROOM_MIN_PLAYERS, Math.floor(maxPlayers)));
  }

  private buildMetadata(): {
    roomName: string;
    mode: RoomMode;
    hostNickname: string;
    maxPlayers: number;
    hasPassword: boolean;
  } {
    return {
      roomName: this.currentRoomName,
      mode: this.currentRoomMode,
      hostNickname: this.hostNickname,
      maxPlayers: this.maxClients,
      hasPassword: Boolean(this.roomPassword),
    };
  }
}
