Simple physics engine (shared)

Purpose
- Deterministic first-order Euler simulation for both frontend prediction and backend authority.
- Fixed update rate is 30Hz (dt = 1 / 30).

Main API
- `Update(nowTime)`:
  - Uses internal state and advances simulation to `nowTime` (seconds since game start).
  - Runs in fixed Euler steps.
- `Predict(lastUpdateTime, nowTime)`:
  - Predicts object state from a known timestamp to `nowTime` without mutating engine state.
- `SetStat(stat)`:
  - Accepts `PhysicsEngineStat` object or JSON string payload.
  - Synchronizes wind, last update timestamp, and all object states.
- `GetStat()`:
  - Returns `{ lastUpdateTime, wind, objects }`.

Objects
- Types: `player`, `projectile`.
- Shared attributes:
  - `id`, `name`, `type`, `radius`, `position`, `velocity`
  - `viscosity`, `drag`, `collidable`, `metadata`
- Projectile specific behavior:
  - Grounded when speed is below `groundedSpeedThreshold`.
  - Grounded when age reaches `lifetime`.
  - `lifetime = -1` means never grounded by lifetime.

Environment forces
- Wind vector defaults to `{ x: 0, y: 0 }` and is configurable via `SetWind`.
- Wind acceleration per second: `wind * drag`.
- Viscous slowdown per second: `viscosity * velocity`.

Collision
- Circular colliders: hit when distance <= sum of radii.
- Only collidable and non-grounded objects are checked.
- When a projectile collides, it is grounded immediately.

Projectile callbacks
- Register by `CreateProjectile(...)` options or:
  - `SetProjectileOnCollide(projectileId, callback)`
  - `SetProjectileOnGrounded(projectileId, callback)`
- Callback argument `other` is the collided object's `name` (or `id` if no name).
