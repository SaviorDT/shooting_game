import {
  type PhysicsEngineStat,
  type PhysicsObjectState,
  ClassicBattleConfig,
  ClassicBattlePlayerConfig,
  ClassicBattleShotInput,
  ClassicBattleShotPayload,
  ClassicBattleShotResult,
  ClassicBattleState,
  ClassicBattleStatePayload,
  PHYSICS_FIXED_DELTA,
  SimplePhysicsEngine,
  createClassicBattleState,
} from 'shared';

export interface ClassicBattlePlayerSummary {
  sessionId: string;
  nickname: string;
}

export class ClassicBattleService {
  private readonly config: ClassicBattleConfig;
  private state: ClassicBattleState | null = null;
  private engine: SimplePhysicsEngine | null = null;
  private startedAtMs = 0;
  private lastTickAtMs = 0;

  constructor(config?: ClassicBattleConfig) {
    this.config = config ?? new ClassicBattleConfig();
  }

  getConfig(): ClassicBattleConfig {
    return this.config;
  }

  getState(): ClassicBattleState | null {
    return this.state;
  }

  buildStatePayload(): ClassicBattleStatePayload | null {
    if (!this.state || !this.engine) {
      return null;
    }

    return {
      config: this.config,
      state: this.state,
      physicsStat: this.engine.GetStat(),
    };
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
        maxHp: this.config.initialHp,
      }),
      new ClassicBattlePlayerConfig({
        id: second.sessionId,
        name: second.nickname,
        startX: 250,
        startY: 700,
        maxHp: this.config.initialHp,
      }),
    ];

    this.state = createClassicBattleState(this.config, roster);
    this.startedAtMs = Date.now();
    this.lastTickAtMs = this.startedAtMs;
    this.engine = this.createInitialEngine(this.state);

    return {
      payload: this.buildStatePayload() as ClassicBattleStatePayload,
    };
  }

  applyShot(input: ClassicBattleShotInput): { payload: ClassicBattleShotPayload } | { error: string } {
    if (!this.state || !this.engine) {
      return { error: 'Game not started.' };
    }

    if (this.state.winnerId) {
      return { error: 'Game already finished.' };
    }

    const shotTimeMs = sanitizeShotTime(input.firedAtMs);
    this.advanceTo(shotTimeMs);

    const shooter = this.state.players.find((player) => player.id === input.shooterId);
    if (!shooter) {
      return { error: 'Shooter not found.' };
    }

    const isMoveBullet = input.bullet === 'move';
    const shotEnergyCost = isMoveBullet ? this.config.moveShotEnergyCost : this.config.shotEnergyCost;

    if (shooter.energy < shotEnergyCost) {
      return { error: 'Not enough energy.' };
    }

    const pullDistance = Math.hypot(input.pullX, input.pullY);
    if (pullDistance < this.config.minPullDistance) {
      return { error: 'Pull distance too short.' };
    }

    shooter.energy = Math.max(0, shooter.energy - shotEnergyCost);

    const clampedDistance = Math.min(pullDistance, this.config.maxPullDistance);
    const power = clampedDistance / this.config.maxPullDistance;
    const directionX = input.pullX / pullDistance;
    const directionY = input.pullY / pullDistance;
    const velocityX = directionX * this.config.bulletSpeed * power;
    const velocityY = directionY * this.config.bulletSpeed * power;

    let path = [{ x: shooter.x, y: shooter.y }];

    if (isMoveBullet) {
      this.setPlayerVelocity(shooter.id, velocityX, velocityY);
    } else {
      const spawnOffset = this.config.playerRadius + this.config.hitPadding + this.config.bulletRadius + 1;
      const spawnX = shooter.x + directionX * spawnOffset;
      const spawnY = shooter.y + directionY * spawnOffset;
      const projectileId = `shot:${input.shotId}`;

      const mapDiagonal = Math.hypot(this.config.width, this.config.height);
      const bulletSpeed = Math.max(1, this.config.bulletSpeed * power);
      const projectileLifetime = Math.max(1, mapDiagonal / bulletSpeed + PHYSICS_FIXED_DELTA * 2);

      this.engine.CreateProjectile({
        id: projectileId,
        name: projectileId,
        radius: this.config.bulletRadius,
        position: { x: spawnX, y: spawnY },
        velocity: { x: velocityX, y: velocityY },
        viscosity: 0,
        drag: 0,
        collidable: true,
        lifetime: projectileLifetime,
        groundedSpeedThreshold: 0,
        onCollide: (other) => {
          this.onProjectileCollide(shooter.id, other);
        },
      });
      path = [{ x: spawnX, y: spawnY }];
    }

    const shot: ClassicBattleShotResult = {
      shotId: input.shotId,
      shooterId: input.shooterId,
      bullet: input.bullet,
      path,
    };

    return {
      payload: {
        shot,
        state: this.state,
        physicsStat: this.engine.GetStat(),
      },
    };
  }

  tick(nowMs: number): ClassicBattleStatePayload | null {
    if (!this.state || !this.engine) {
      return null;
    }

    this.advanceTo(nowMs);

    return {
      config: this.config,
      state: this.state,
      physicsStat: this.engine.GetStat(),
    };
  }

  handlePlayerLeft(activeSessionIds: Set<string>): ClassicBattleStatePayload | null {
    if (!this.state || !this.engine || this.state.winnerId) {
      return null;
    }

    const remaining = this.state.players.filter((player) => activeSessionIds.has(player.id));
    if (remaining.length !== 1) {
      return null;
    }

    this.state = new ClassicBattleState({
      players: this.state.players,
      lastEnergyUpdateAtMs: Date.now(),
      winnerId: remaining[0].id,
    });

    return {
      config: this.config,
      state: this.state,
      physicsStat: this.engine.GetStat(),
    };
  }

  private createInitialEngine(state: ClassicBattleState): SimplePhysicsEngine {
    const engine = new SimplePhysicsEngine();

    state.players.forEach((player) => {
      engine.CreatePlayer({
        id: player.id,
        name: player.id,
        radius: this.config.playerRadius + this.config.hitPadding,
        position: { x: player.x, y: player.y },
        velocity: { x: 0, y: 0 },
        viscosity: this.config.playerViscosity,
        drag: 0,
        collidable: true,
      });
    });

    return engine;
  }

  private onProjectileCollide(shooterId: string, collidedObjectId: string): void {
    if (!this.state || this.state.winnerId) {
      return;
    }

    if (collidedObjectId === shooterId) {
      return;
    }

    const target = this.state.players.find((player) => player.id === collidedObjectId);
    if (!target || target.hp <= 0) {
      return;
    }

    target.hp = Math.max(0, target.hp - this.config.shotDamage);
    if (target.hp === 0) {
      this.state.winnerId = shooterId;
    }
  }

  private advanceTo(nowMs: number): void {
    if (!this.state || !this.engine) {
      return;
    }

    const sanitizedNowMs = sanitizeShotTime(nowMs);
    const targetMs = Math.max(this.lastTickAtMs, sanitizedNowMs);
    regenerateEnergy(this.config, this.state, targetMs);

    const simulationSeconds = Math.max(0, (targetMs - this.startedAtMs) / 1000);
    const stat = this.engine.Update(simulationSeconds);
    const nextStat = this.applyPlayerBoundaryBounce(stat);
    this.syncPlayersFromPhysics(nextStat);
    this.lastTickAtMs = targetMs;
  }

  private setPlayerVelocity(playerId: string, velocityX: number, velocityY: number): void {
    if (!this.engine) {
      return;
    }

    const stat = this.engine.GetStat();
    let changed = false;

    stat.objects.forEach((object) => {
      if (object.type !== 'player' || object.id !== playerId) {
        return;
      }

      object.velocity.x = velocityX;
      object.velocity.y = velocityY;
      changed = true;
    });

    if (changed) {
      this.engine.SetStat(stat);
      this.syncPlayersFromPhysics(stat);
    }
  }

  private applyPlayerBoundaryBounce(stat: PhysicsEngineStat): PhysicsEngineStat {
    if (!this.engine) {
      return stat;
    }

    let changed = false;

    stat.objects.forEach((object) => {
      if (object.type !== 'player') {
        return;
      }

      changed = this.bouncePlayerAtMapEdge(object) || changed;
    });

    if (changed) {
      this.engine.SetStat(stat);
    }

    return stat;
  }

  private bouncePlayerAtMapEdge(playerObject: PhysicsObjectState): boolean {
    let changed = false;

    const minX = playerObject.radius;
    const maxX = this.config.width - playerObject.radius;
    const minY = playerObject.radius;
    const maxY = this.config.height - playerObject.radius;

    if (playerObject.position.x < minX) {
      playerObject.position.x = minX;
      playerObject.velocity.x = Math.abs(playerObject.velocity.x);
      changed = true;
    } else if (playerObject.position.x > maxX) {
      playerObject.position.x = maxX;
      playerObject.velocity.x = -Math.abs(playerObject.velocity.x);
      changed = true;
    }

    if (playerObject.position.y < minY) {
      playerObject.position.y = minY;
      playerObject.velocity.y = Math.abs(playerObject.velocity.y);
      changed = true;
    } else if (playerObject.position.y > maxY) {
      playerObject.position.y = maxY;
      playerObject.velocity.y = -Math.abs(playerObject.velocity.y);
      changed = true;
    }

    return changed;
  }

  private syncPlayersFromPhysics(stat: PhysicsEngineStat): void {
    if (!this.state) {
      return;
    }

    const playerObjects = new Map(
      stat.objects
        .filter((object) => object.type === 'player')
        .map((object) => [object.id, object]),
    );

    this.state.players.forEach((player) => {
      const object = playerObjects.get(player.id);
      if (!object) {
        return;
      }

      player.x = object.position.x;
      player.y = object.position.y;
    });
  }
}

function sanitizeShotTime(firedAtMs: number): number {
  if (typeof firedAtMs !== 'number' || !Number.isFinite(firedAtMs)) {
    return Date.now();
  }

  return firedAtMs;
}

function regenerateEnergy(config: ClassicBattleConfig, state: ClassicBattleState, nowMs: number): void {
  const previousMs = Math.max(0, state.lastEnergyUpdateAtMs);
  if (nowMs <= previousMs) {
    return;
  }

  const regenAmount = ((nowMs - previousMs) / 1000) * config.energyRegenPerSecond;
  if (regenAmount <= 0) {
    state.lastEnergyUpdateAtMs = nowMs;
    return;
  }

  state.players.forEach((player) => {
    player.energy = Math.min(player.maxEnergy, player.energy + regenAmount);
  });

  state.lastEnergyUpdateAtMs = nowMs;
}
