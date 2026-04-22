import { PHYSICS_FIXED_DELTA, SimplePhysicsEngine } from '../engine/simplePhysicsEngine.js';
import type { PhysicsEngineStat } from '../engine/simplePhysicsEngine.js';

export interface ClassicBattleConfigOptions {
  width: number;
  height: number;
  playerRadius: number;
  bulletRadius: number;
  bulletSpeed: number;
  minPullDistance: number;
  maxPullDistance: number;
  hitPadding: number;
  initialHp: number;
  initialEnergy: number;
  maxEnergy: number;
  energyRegenPerSecond: number;
  shotEnergyCost: number;
  shotDamage: number;
}

export class ClassicBattleConfig {
  width: number;
  height: number;
  playerRadius: number;
  bulletRadius: number;
  bulletSpeed: number;
  minPullDistance: number;
  maxPullDistance: number;
  hitPadding: number;
  initialHp: number;
  initialEnergy: number;
  maxEnergy: number;
  energyRegenPerSecond: number;
  shotEnergyCost: number;
  shotDamage: number;

  constructor(options: Partial<ClassicBattleConfigOptions> = {}) {
    this.width = options.width ?? 500;
    this.height = options.height ?? 800;
    this.playerRadius = options.playerRadius ?? 20;
    this.bulletRadius = options.bulletRadius ?? 6;
    this.bulletSpeed = options.bulletSpeed ?? 650;
    this.minPullDistance = options.minPullDistance ?? 18;
    this.maxPullDistance = options.maxPullDistance ?? 150;
    this.hitPadding = options.hitPadding ?? 8;
    this.initialHp = options.initialHp ?? 100;
    this.initialEnergy = options.initialEnergy ?? 100;
    this.maxEnergy = options.maxEnergy ?? 100;
    this.energyRegenPerSecond = options.energyRegenPerSecond ?? 5;
    this.shotEnergyCost = options.shotEnergyCost ?? 20;
    this.shotDamage = options.shotDamage ?? 20;
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
  energy: number;
  maxEnergy: number;
}

export class ClassicBattlePlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;

  constructor(options: ClassicBattlePlayerStateOptions) {
    this.id = options.id;
    this.name = options.name;
    this.x = options.x;
    this.y = options.y;
    this.hp = options.hp;
    this.maxHp = options.maxHp;
    this.energy = options.energy;
    this.maxEnergy = options.maxEnergy;
  }
}

export interface ClassicBattleStateOptions {
  players: ClassicBattlePlayerState[];
  lastEnergyUpdateAtMs: number;
  winnerId?: string | null;
}

export class ClassicBattleState {
  players: ClassicBattlePlayerState[];
  lastEnergyUpdateAtMs: number;
  winnerId: string | null;

  constructor(options: ClassicBattleStateOptions) {
    this.players = options.players;
    this.lastEnergyUpdateAtMs = options.lastEnergyUpdateAtMs;
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
  firedAtMs?: number;
}

export interface ClassicBattleShotResult {
  shotId: string;
  shooterId: string;
  path: ClassicBattlePoint[];
  hitPlayerId?: string;
  winnerId?: string;
}

export interface ClassicBattleStatePayload {
  config: ClassicBattleConfig;
  state: ClassicBattleState;
  physicsStat: PhysicsEngineStat;
}

export interface ClassicBattleShotPayload {
  shot: ClassicBattleShotResult;
  state: ClassicBattleState;
  physicsStat: PhysicsEngineStat;
}

export function createClassicBattleState(
  config: ClassicBattleConfig,
  players: ClassicBattlePlayerConfig[],
): ClassicBattleState {
  const maxEnergy = Math.max(0, config.maxEnergy);
  const initialEnergy = Math.min(Math.max(0, config.initialEnergy), maxEnergy);
  const initialHp = Math.max(1, config.initialHp);
  const playerStates = players.map(
    (player) =>
      new ClassicBattlePlayerState({
        id: player.id,
        name: player.name,
        x: player.startX,
        y: player.startY,
        hp: Math.max(1, player.maxHp || initialHp),
        maxHp: Math.max(1, player.maxHp || initialHp),
        energy: initialEnergy,
        maxEnergy,
      }),
  );

  return new ClassicBattleState({
    players: playerStates,
    lastEnergyUpdateAtMs: Date.now(),
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

  const shooter = nextState.players.find((player) => player.id === input.shooterId);
  if (!shooter) {
    return { state: nextState, error: 'Shooter not found.' };
  }

  const target = nextState.players.find((player) => player.id !== input.shooterId);
  if (!target) {
    return { state: nextState, error: 'Target not found.' };
  }

  const shotTimeMs = sanitizeShotTime(input.firedAtMs);
  regenerateEnergy(config, nextState, shotTimeMs);

  if (shooter.energy < config.shotEnergyCost) {
    return { state: nextState, error: 'Not enough energy.' };
  }

  shooter.energy = Math.max(0, shooter.energy - config.shotEnergyCost);

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

  const simulation = simulateShotPathWithPhysics(config, {
    shotId: input.shotId,
    shooter,
    target,
    velocityX,
    velocityY,
  });

  const path = simulation.path;
  const hitPlayerId = simulation.hitPlayerId;

  if (hitPlayerId) {
    target.hp = Math.max(0, target.hp - config.shotDamage);
    if (target.hp === 0) {
      nextState.winnerId = shooter.id;
    }
  }

  const shot: ClassicBattleShotResult = {
    shotId: input.shotId,
    shooterId: input.shooterId,
    path,
  };

  if (hitPlayerId) {
    shot.hitPlayerId = hitPlayerId;
  }

  if (nextState.winnerId) {
    shot.winnerId = nextState.winnerId;
  }

  return { state: nextState, shot };
}

interface PhysicsShotSimulationInput {
  shotId: string;
  shooter: ClassicBattlePlayerState;
  target: ClassicBattlePlayerState;
  velocityX: number;
  velocityY: number;
}

function simulateShotPathWithPhysics(
  config: ClassicBattleConfig,
  input: PhysicsShotSimulationInput,
): { path: ClassicBattlePoint[]; hitPlayerId?: string } {
  const engine = new SimplePhysicsEngine();
  let hitPlayerId: string | undefined;

  const projectileId = `shot:${input.shotId}`;
  const maxSimulationSeconds = 6;
  const maxSteps = Math.ceil(maxSimulationSeconds / PHYSICS_FIXED_DELTA);

  engine.CreatePlayer({
    id: input.target.id,
    name: input.target.id,
    radius: config.playerRadius + config.hitPadding,
    position: { x: input.target.x, y: input.target.y },
    velocity: { x: 0, y: 0 },
    viscosity: 0,
    drag: 0,
    collidable: true,
  });

  engine.CreateProjectile({
    id: projectileId,
    name: projectileId,
    radius: config.bulletRadius,
    position: { x: input.shooter.x, y: input.shooter.y },
    velocity: { x: input.velocityX, y: input.velocityY },
    viscosity: 0,
    drag: 0,
    collidable: true,
    lifetime: maxSimulationSeconds,
    groundedSpeedThreshold: 0,
    onCollide: (other) => {
      if (other === input.target.id) {
        hitPlayerId = input.target.id;
      }
    },
  });

  const path: ClassicBattlePoint[] = [{ x: input.shooter.x, y: input.shooter.y }];
  let simulationTime = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    simulationTime += PHYSICS_FIXED_DELTA;
    const stat = engine.Update(simulationTime);
    const projectile = stat.objects.find((object) => object.id === projectileId);

    if (!projectile) {
      break;
    }

    path.push({ x: projectile.position.x, y: projectile.position.y });

    const outsideX = projectile.position.x < -config.bulletRadius
      || projectile.position.x > config.width + config.bulletRadius;
    const outsideY = projectile.position.y < -config.bulletRadius
      || projectile.position.y > config.height + config.bulletRadius;

    if (outsideX || outsideY || projectile.grounded) {
      break;
    }
  }

  if (hitPlayerId) {
    return { path, hitPlayerId };
  }

  return { path };
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
        energy: player.energy,
        maxEnergy: player.maxEnergy,
      }),
  );

  return new ClassicBattleState({
    players,
    lastEnergyUpdateAtMs: state.lastEnergyUpdateAtMs,
    winnerId: state.winnerId,
  });
}

function sanitizeShotTime(firedAtMs?: number): number {
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
