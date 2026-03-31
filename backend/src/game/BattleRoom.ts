import { Client, Room } from 'colyseus';
import type { RoomMode } from 'shared';

interface BattleRoomOptions {
  roomName: string;
  mode: RoomMode;
  hostNickname: string;
}

interface PlayerJoinOptions {
  nickname?: string;
}

interface RoomPlayer {
  sessionId: string;
  nickname: string;
  isHost: boolean;
}

export class BattleRoom extends Room {
  maxClients = 8;
  private hostSessionId: string | null = null;
  private readonly players = new Map<string, RoomPlayer>();

  onCreate(options: BattleRoomOptions): void {
    this.setMetadata({
      roomName: options.roomName,
      mode: options.mode,
      hostNickname: options.hostNickname,
    });
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

    await this.setMetadata({
      hostNickname: nextPlayer.nickname,
    });
  }

  onDispose(): void {
    // Reserved for future room cleanup.
  }

  getPlayersSummary(): RoomPlayer[] {
    return Array.from(this.players.values());
  }

  removePlayerBySessionId(sessionId: string): boolean {
    const targetClient = this.clients.find((client) => client.sessionId === sessionId);
    if (!targetClient) {
      return false;
    }

    targetClient.leave(1000);
    return true;
  }
}
