export interface ClassicBattleConfigOptions {
  width: number;
  height: number;
  playerRadius: number;
  bulletRadius: number;
  bulletSpeed: number;
  minPullDistance: number;
  maxPullDistance: number;
  turnSwitchDelayMs: number;
  hitPadding: number;
}

export class ClassicBattleConfig {
  width: number;
  height: number;
  playerRadius: number;
  bulletRadius: number;
  bulletSpeed: number;
  minPullDistance: number;
  maxPullDistance: number;
  turnSwitchDelayMs: number;
  hitPadding: number;

  constructor(options: Partial<ClassicBattleConfigOptions> = {}) {
    this.width = options.width ?? 500;
    this.height = options.height ?? 800;
    this.playerRadius = options.playerRadius ?? 20;
    this.bulletRadius = options.bulletRadius ?? 6;
    this.bulletSpeed = options.bulletSpeed ?? 650;
    this.minPullDistance = options.minPullDistance ?? 18;
    this.maxPullDistance = options.maxPullDistance ?? 150;
    this.turnSwitchDelayMs = options.turnSwitchDelayMs ?? 450;
    this.hitPadding = options.hitPadding ?? 8;
  }
}

export interface ClassicBattlePlayerOptions {
  id: string;
  name: string;
  startX: number;
  startY: number;
  maxHp: number;
}

export class ClassicBattlePlayerConfig {
  id: string;
  name: string;
  startX: number;
  startY: number;
  maxHp: number;

  constructor(options: ClassicBattlePlayerOptions) {
    this.id = options.id;
    this.name = options.name;
    this.startX = options.startX;
    this.startY = options.startY;
    this.maxHp = options.maxHp;
  }
}

export interface ClassicBattlePlayerStateOptions {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

export class ClassicBattlePlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;

  constructor(options: ClassicBattlePlayerStateOptions) {
    this.id = options.id;
    this.name = options.name;
    this.x = options.x;
    this.y = options.y;
    this.hp = options.hp;
    this.maxHp = options.maxHp;
  }
}

export interface ClassicBattleStateOptions {
  players: ClassicBattlePlayerState[];
  activePlayerId: string;
  winnerId?: string | null;
}

export class ClassicBattleState {
  players: ClassicBattlePlayerState[];
  activePlayerId: string;
  winnerId: string | null;

  constructor(options: ClassicBattleStateOptions) {
    this.players = options.players;
    this.activePlayerId = options.activePlayerId;
    this.winnerId = options.winnerId ?? null;
  }
}

export interface ClassicBattlePoint {
  x: number;
  y: number;
}

export interface ClassicBattleShotInput {
  shotId: string;
  shooterId: string;
  pullX: number;
  pullY: number;
}

export interface ClassicBattleShotResult {
  shotId: string;
  shooterId: string;
  path: ClassicBattlePoint[];
  hitPlayerId?: string;
  winnerId?: string;
  nextActivePlayerId: string;
}

export interface ClassicBattleStatePayload {
  config: ClassicBattleConfig;
  state: ClassicBattleState;
}

export interface ClassicBattleShotPayload {
  shot: ClassicBattleShotResult;
  state: ClassicBattleState;
}

export function createClassicBattleState(
  _config: ClassicBattleConfig,
  players: ClassicBattlePlayerConfig[],
): ClassicBattleState {
  const playerStates = players.map(
    (player) =>
      new ClassicBattlePlayerState({
        id: player.id,
        name: player.name,
        x: player.startX,
        y: player.startY,
        hp: player.maxHp,
        maxHp: player.maxHp,
      }),
  );

  const activePlayerId = playerStates[0]?.id ?? '';

  return new ClassicBattleState({
    players: playerStates,
    activePlayerId,
    winnerId: null,
  });
}

export function simulateClassicBattleShot(
  config: ClassicBattleConfig,
  state: ClassicBattleState,
  input: ClassicBattleShotInput,
): { state: ClassicBattleState; shot: ClassicBattleShotResult } | { state: ClassicBattleState; error: string } {
  const nextState = cloneClassicBattleState(state);

  if (nextState.winnerId) {
    return { state: nextState, error: 'Game already finished.' };
  }

  if (nextState.activePlayerId !== input.shooterId) {
    return { state: nextState, error: 'Not active player.' };
  }

  const shooter = nextState.players.find((player) => player.id === input.shooterId);
  if (!shooter) {
    return { state: nextState, error: 'Shooter not found.' };
  }

  const target = nextState.players.find((player) => player.id !== input.shooterId);
  if (!target) {
    return { state: nextState, error: 'Target not found.' };
  }

  const pullDistance = Math.hypot(input.pullX, input.pullY);
  if (pullDistance < config.minPullDistance) {
    return { state: nextState, error: 'Pull distance too short.' };
  }

  const clampedDistance = Math.min(pullDistance, config.maxPullDistance);
  const power = clampedDistance / config.maxPullDistance;
  const directionX = input.pullX / pullDistance;
  const directionY = input.pullY / pullDistance;
  const velocityX = directionX * config.bulletSpeed * power;
  const velocityY = directionY * config.bulletSpeed * power;

  const path: ClassicBattlePoint[] = [{ x: shooter.x, y: shooter.y }];
  const dt = 1 / 60;
  const maxSteps = 360;
  const hitRadius = config.playerRadius + config.bulletRadius + config.hitPadding;
  let hitPlayerId: string | undefined;

  let bulletX = shooter.x;
  let bulletY = shooter.y;

  for (let step = 0; step < maxSteps; step += 1) {
    bulletX += velocityX * dt;
    bulletY += velocityY * dt;

    if (step % 2 === 0) {
      path.push({ x: bulletX, y: bulletY });
    }

    const distanceToTarget = Math.hypot(bulletX - target.x, bulletY - target.y);
    if (distanceToTarget <= hitRadius) {
      hitPlayerId = target.id;
      break;
    }

    const outsideX = bulletX < -config.bulletRadius || bulletX > config.width + config.bulletRadius;
    const outsideY = bulletY < -config.bulletRadius || bulletY > config.height + config.bulletRadius;
    if (outsideX || outsideY) {
      break;
    }
  }

  if (hitPlayerId) {
    target.hp = Math.max(0, target.hp - 1);
    if (target.hp === 0) {
      nextState.winnerId = shooter.id;
    }
  }

  nextState.activePlayerId = target.id;

  const shot: ClassicBattleShotResult = {
    shotId: input.shotId,
    shooterId: input.shooterId,
    path,
    nextActivePlayerId: nextState.activePlayerId,
  };

  if (hitPlayerId) {
    shot.hitPlayerId = hitPlayerId;
  }

  if (nextState.winnerId) {
    shot.winnerId = nextState.winnerId;
  }

  return { state: nextState, shot };
}

function cloneClassicBattleState(state: ClassicBattleState): ClassicBattleState {
  const players = state.players.map(
    (player) =>
      new ClassicBattlePlayerState({
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
      }),
  );

  return new ClassicBattleState({
    players,
    activePlayerId: state.activePlayerId,
    winnerId: state.winnerId,
  });
}
