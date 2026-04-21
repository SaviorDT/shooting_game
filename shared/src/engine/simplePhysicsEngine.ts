export const PHYSICS_FPS = 30;
export const PHYSICS_FIXED_DELTA = 1 / PHYSICS_FPS;

export type PhysicsObjectType = 'player' | 'projectile';

export interface PhysicsVector2 {
  x: number;
  y: number;
}

export interface PhysicsObjectState {
  id: string;
  name: string;
  type: PhysicsObjectType;
  radius: number;
  position: PhysicsVector2;
  velocity: PhysicsVector2;
  viscosity: number;
  drag: number;
  collidable: boolean;
  grounded: boolean;
  lifetime: number;
  groundedSpeedThreshold: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface PhysicsEngineStat {
  lastUpdateTime: number;
  wind: PhysicsVector2;
  objects: PhysicsObjectState[];
}

export interface CreatePhysicsObjectOptions {
  id: string;
  name?: string;
  radius?: number;
  position?: PhysicsVector2;
  velocity?: PhysicsVector2;
  viscosity?: number;
  drag?: number;
  collidable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreatePlayerOptions extends CreatePhysicsObjectOptions {}

export interface CreateProjectileOptions extends CreatePhysicsObjectOptions {
  lifetime?: number;
  groundedSpeedThreshold?: number;
  onCollide?: (other: string) => void;
  onGrounded?: (other: string) => void;
}

interface InternalSimulationOptions {
  enableCallbacks: boolean;
}

export class SimplePhysicsEngine {
  private readonly objects = new Map<string, PhysicsObjectState>();

  private readonly onCollideCallbacks = new Map<string, (other: string) => void>();

  private readonly onGroundedCallbacks = new Map<string, (other: string) => void>();

  private wind: PhysicsVector2 = { x: 0, y: 0 };

  private lastUpdateTime = 0;

  SetWind(wind: PhysicsVector2): void {
    this.wind = sanitizeVector(wind);
  }

  CreatePlayer(options: CreatePlayerOptions): PhysicsObjectState {
    const player = createObjectState('player', options, this.lastUpdateTime);
    this.objects.set(player.id, player);
    return cloneObjectState(player);
  }

  CreateProjectile(options: CreateProjectileOptions): PhysicsObjectState {
    const projectile = createObjectState('projectile', options, this.lastUpdateTime);
    this.objects.set(projectile.id, projectile);

    if (typeof options.onCollide === 'function') {
      this.onCollideCallbacks.set(projectile.id, options.onCollide);
    }

    if (typeof options.onGrounded === 'function') {
      this.onGroundedCallbacks.set(projectile.id, options.onGrounded);
    }

    return cloneObjectState(projectile);
  }

  SetProjectileOnCollide(projectileId: string, callback: (other: string) => void): void {
    if (!this.objects.has(projectileId)) {
      return;
    }

    this.onCollideCallbacks.set(projectileId, callback);
  }

  SetProjectileOnGrounded(projectileId: string, callback: (other: string) => void): void {
    if (!this.objects.has(projectileId)) {
      return;
    }

    this.onGroundedCallbacks.set(projectileId, callback);
  }

  Update(nowTime: number): PhysicsEngineStat {
    const targetTime = sanitizeTime(nowTime);

    if (targetTime < this.lastUpdateTime) {
      return this.GetStat();
    }

    this.simulate(this.objects, this.lastUpdateTime, targetTime, { enableCallbacks: true });
    this.lastUpdateTime = targetTime;
    return this.GetStat();
  }

  Predict(lastUpdateTime: number, nowTime: number): PhysicsEngineStat {
    const fromTime = sanitizeTime(lastUpdateTime);
    const toTime = sanitizeTime(nowTime);
    const clonedObjects = cloneObjectMap(this.objects);

    if (toTime <= fromTime) {
      return {
        lastUpdateTime: toTime,
        wind: cloneVector(this.wind),
        objects: cloneObjectsFromMap(clonedObjects),
      };
    }

    this.simulate(clonedObjects, fromTime, toTime, { enableCallbacks: false });

    return {
      lastUpdateTime: toTime,
      wind: cloneVector(this.wind),
      objects: cloneObjectsFromMap(clonedObjects),
    };
  }

  SetStat(stat: string | PhysicsEngineStat): void {
    const normalized = normalizeStatInput(stat);

    this.wind = cloneVector(normalized.wind);
    this.lastUpdateTime = normalized.lastUpdateTime;

    const previousOnCollide = new Map(this.onCollideCallbacks);
    const previousOnGrounded = new Map(this.onGroundedCallbacks);

    this.objects.clear();
    this.onCollideCallbacks.clear();
    this.onGroundedCallbacks.clear();

    for (const object of normalized.objects) {
      this.objects.set(object.id, cloneObjectState(object));

      if (object.type === 'projectile') {
        const collideCb = previousOnCollide.get(object.id);
        const groundedCb = previousOnGrounded.get(object.id);

        if (collideCb) {
          this.onCollideCallbacks.set(object.id, collideCb);
        }

        if (groundedCb) {
          this.onGroundedCallbacks.set(object.id, groundedCb);
        }
      }
    }
  }

  GetStat(): PhysicsEngineStat {
    return {
      lastUpdateTime: this.lastUpdateTime,
      wind: cloneVector(this.wind),
      objects: cloneObjectsFromMap(this.objects),
    };
  }

  private simulate(
    objects: Map<string, PhysicsObjectState>,
    startTime: number,
    endTime: number,
    options: InternalSimulationOptions,
  ): void {
    let cursor = startTime;

    while (cursor < endTime) {
      const deltaTime = Math.min(PHYSICS_FIXED_DELTA, endTime - cursor);
      this.step(objects, deltaTime, cursor + deltaTime, options);
      cursor += deltaTime;
    }
  }

  private step(
    objects: Map<string, PhysicsObjectState>,
    deltaTime: number,
    simulationTime: number,
    options: InternalSimulationOptions,
  ): void {
    for (const object of objects.values()) {
      if (object.type === 'projectile' && object.grounded) {
        continue;
      }

      const acceleration = {
        x: this.wind.x * object.drag,
        y: this.wind.y * object.drag,
      };

      // First-order Euler integration.
      object.position.x += object.velocity.x * deltaTime;
      object.position.y += object.velocity.y * deltaTime;
      object.velocity.x += (acceleration.x - object.viscosity * object.velocity.x) * deltaTime;
      object.velocity.y += (acceleration.y - object.viscosity * object.velocity.y) * deltaTime;
    }

    this.handleProjectileGrounding(objects, simulationTime, options);
    this.handleCollisions(objects, options);
  }

  private handleProjectileGrounding(
    objects: Map<string, PhysicsObjectState>,
    simulationTime: number,
    options: InternalSimulationOptions,
  ): void {
    for (const object of objects.values()) {
      if (object.type !== 'projectile' || object.grounded) {
        continue;
      }

      const age = Math.max(0, simulationTime - object.createdAt);
      const speed = Math.hypot(object.velocity.x, object.velocity.y);
      const reachedLifetime = object.lifetime !== -1 && age >= object.lifetime;
      const belowSpeed = speed < object.groundedSpeedThreshold;

      if (!reachedLifetime && !belowSpeed) {
        continue;
      }

      object.grounded = true;

      if (!options.enableCallbacks) {
        continue;
      }

      const groundedCallback = this.onGroundedCallbacks.get(object.id);
      if (groundedCallback) {
        groundedCallback('ground');
      }
    }
  }

  private handleCollisions(objects: Map<string, PhysicsObjectState>, options: InternalSimulationOptions): void {
    const objectList = [...objects.values()];

    for (let i = 0; i < objectList.length; i += 1) {
      const first = objectList[i];
      if (!first || !first.collidable || first.grounded) {
        continue;
      }

      for (let j = i + 1; j < objectList.length; j += 1) {
        const second = objectList[j];
        if (!second || !second.collidable || second.grounded) {
          continue;
        }

        const distance = Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
        const hit = distance <= first.radius + second.radius;

        if (!hit) {
          continue;
        }

        this.onCollisionDetected(first, second, options);
      }
    }
  }

  private onCollisionDetected(first: PhysicsObjectState, second: PhysicsObjectState, options: InternalSimulationOptions): void {
    if (first.type === 'projectile' && !first.grounded) {
      first.grounded = true;
      if (options.enableCallbacks) {
        this.onCollideCallbacks.get(first.id)?.(second.name || second.id);
        this.onGroundedCallbacks.get(first.id)?.(second.name || second.id);
      }
    }

    if (second.type === 'projectile' && !second.grounded) {
      second.grounded = true;
      if (options.enableCallbacks) {
        this.onCollideCallbacks.get(second.id)?.(first.name || first.id);
        this.onGroundedCallbacks.get(second.id)?.(first.name || first.id);
      }
    }
  }
}

function createObjectState(type: PhysicsObjectType, options: CreatePhysicsObjectOptions, nowTime: number): PhysicsObjectState {
  const position = sanitizeVector(options.position);
  const velocity = sanitizeVector(options.velocity);

  const base: PhysicsObjectState = {
    id: options.id,
    name: options.name ?? options.id,
    type,
    radius: sanitizeNonNegative(options.radius, 8),
    position,
    velocity,
    viscosity: sanitizeNonNegative(options.viscosity, 0),
    drag: sanitizeNonNegative(options.drag, 1),
    collidable: options.collidable ?? true,
    grounded: false,
    lifetime: -1,
    groundedSpeedThreshold: type === 'projectile' ? 0.5 : 0,
    createdAt: nowTime,
    ...(options.metadata ? { metadata: { ...options.metadata } } : {}),
  };

  if (type === 'projectile') {
    const projectileOptions = options as CreateProjectileOptions;
    base.lifetime = projectileOptions.lifetime === undefined ? -1 : sanitizeLifetime(projectileOptions.lifetime);
    base.groundedSpeedThreshold = sanitizeNonNegative(projectileOptions.groundedSpeedThreshold, 0.5);
  }

  return base;
}

function cloneVector(vector: PhysicsVector2): PhysicsVector2 {
  return { x: vector.x, y: vector.y };
}

function cloneObjectState(object: PhysicsObjectState): PhysicsObjectState {
  return {
    id: object.id,
    name: object.name,
    type: object.type,
    radius: object.radius,
    position: cloneVector(object.position),
    velocity: cloneVector(object.velocity),
    viscosity: object.viscosity,
    drag: object.drag,
    collidable: object.collidable,
    grounded: object.grounded,
    lifetime: object.lifetime,
    groundedSpeedThreshold: object.groundedSpeedThreshold,
    createdAt: object.createdAt,
    ...(object.metadata ? { metadata: { ...object.metadata } } : {}),
  };
}

function cloneObjectsFromMap(objects: Map<string, PhysicsObjectState>): PhysicsObjectState[] {
  return [...objects.values()].map((object) => cloneObjectState(object));
}

function cloneObjectMap(objects: Map<string, PhysicsObjectState>): Map<string, PhysicsObjectState> {
  const cloned = new Map<string, PhysicsObjectState>();
  for (const object of objects.values()) {
    cloned.set(object.id, cloneObjectState(object));
  }
  return cloned;
}

function sanitizeVector(vector?: PhysicsVector2): PhysicsVector2 {
  return {
    x: sanitizeNumber(vector?.x, 0),
    y: sanitizeNumber(vector?.y, 0),
  };
}

function sanitizeNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function sanitizeNonNegative(value: number | undefined, fallback: number): number {
  return Math.max(0, sanitizeNumber(value, fallback));
}

function sanitizeLifetime(lifetime: number): number {
  if (lifetime === -1) {
    return -1;
  }

  return sanitizeNonNegative(lifetime, -1);
}

function sanitizeTime(value: number): number {
  return Math.max(0, sanitizeNumber(value, 0));
}

function normalizeStatInput(statInput: string | PhysicsEngineStat): PhysicsEngineStat {
  const raw = typeof statInput === 'string' ? safeParseStat(statInput) : statInput;

  const lastUpdateTime = sanitizeTime(raw.lastUpdateTime);
  const wind = sanitizeVector(raw.wind);

  const objects: PhysicsObjectState[] = raw.objects
    .filter((object) => typeof object?.id === 'string' && object.id.length > 0)
    .map((object) => normalizeObjectState(object, lastUpdateTime));

  return { lastUpdateTime, wind, objects };
}

function safeParseStat(statString: string): PhysicsEngineStat {
  const parsed: unknown = JSON.parse(statString);

  if (!isPhysicsEngineStat(parsed)) {
    throw new Error('Invalid physics stat JSON payload.');
  }

  return parsed;
}

function isPhysicsEngineStat(value: unknown): value is PhysicsEngineStat {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PhysicsEngineStat>;
  return Number.isFinite(candidate.lastUpdateTime)
    && !!candidate.wind
    && typeof candidate.wind === 'object'
    && Array.isArray(candidate.objects);
}

function normalizeObjectState(object: PhysicsObjectState, fallbackCreatedAt: number): PhysicsObjectState {
  const type: PhysicsObjectType = object.type === 'projectile' ? 'projectile' : 'player';

  const normalized: PhysicsObjectState = {
    id: object.id,
    name: typeof object.name === 'string' && object.name.length > 0 ? object.name : object.id,
    type,
    radius: sanitizeNonNegative(object.radius, 8),
    position: sanitizeVector(object.position),
    velocity: sanitizeVector(object.velocity),
    viscosity: sanitizeNonNegative(object.viscosity, 0),
    drag: sanitizeNonNegative(object.drag, 1),
    collidable: object.collidable ?? true,
    grounded: object.grounded ?? false,
    lifetime: type === 'projectile' ? sanitizeLifetime(object.lifetime) : -1,
    groundedSpeedThreshold: type === 'projectile' ? sanitizeNonNegative(object.groundedSpeedThreshold, 0.5) : 0,
    createdAt: sanitizeTime(object.createdAt ?? fallbackCreatedAt),
    ...(object.metadata ? { metadata: { ...object.metadata } } : {}),
  };

  return normalized;
}
