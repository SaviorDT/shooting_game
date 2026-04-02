import {
  ClassicBattleConfig,
  ClassicBattlePlayerConfig,
  ClassicBattleShotInput,
  ClassicBattleShotPayload,
  ClassicBattleState,
  ClassicBattleStatePayload,
  createClassicBattleState,
  simulateClassicBattleShot,
} from 'shared';

export interface ClassicBattlePlayerSummary {
  sessionId: string;
  nickname: string;
}

export class ClassicBattleService {
  private readonly config: ClassicBattleConfig;
  private state: ClassicBattleState | null = null;

  constructor(config?: ClassicBattleConfig) {
    this.config = config ??
      new ClassicBattleConfig({
        width: 500,
        height: 800,
        playerRadius: 20,
        bulletRadius: 6,
        bulletSpeed: 650,
        minPullDistance: 18,
        maxPullDistance: 150,
        turnSwitchDelayMs: 450,
        hitPadding: 8,
      });
  }

  getConfig(): ClassicBattleConfig {
    return this.config;
  }

  getState(): ClassicBattleState | null {
    return this.state;
  }

  startGame(players: ClassicBattlePlayerSummary[]): { payload: ClassicBattleStatePayload } | { error: string } {
    if (players.length < 2) {
      return { error: 'Not enough players to start.' };
    }

    const [first, second] = players;
    const roster = [
      new ClassicBattlePlayerConfig({
        id: first.sessionId,
        name: first.nickname,
        startX: 250,
        startY: 100,
        maxHp: 5,
      }),
      new ClassicBattlePlayerConfig({
        id: second.sessionId,
        name: second.nickname,
        startX: 250,
        startY: 700,
        maxHp: 5,
      }),
    ];

    this.state = createClassicBattleState(this.config, roster);

    return {
      payload: {
        config: this.config,
        state: this.state,
      },
    };
  }

  applyShot(input: ClassicBattleShotInput): { payload: ClassicBattleShotPayload } | { error: string } {
    if (!this.state) {
      return { error: 'Game not started.' };
    }

    const result = simulateClassicBattleShot(this.config, this.state, input);
    if ('error' in result) {
      return { error: result.error };
    }

    this.state = result.state;

    return {
      payload: {
        shot: result.shot,
        state: result.state,
      },
    };
  }

  handlePlayerLeft(activeSessionIds: Set<string>): ClassicBattleStatePayload | null {
    if (!this.state || this.state.winnerId) {
      return null;
    }

    const remaining = this.state.players.filter((player) => activeSessionIds.has(player.id));
    if (remaining.length !== 1) {
      return null;
    }

    this.state = new ClassicBattleState({
      players: this.state.players,
      activePlayerId: remaining[0].id,
      winnerId: remaining[0].id,
    });

    return {
      config: this.config,
      state: this.state,
    };
  }
}
