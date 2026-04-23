Classic battle (shared game logic)

Core logic lives in shared so backend is authoritative and frontend can predict.

Messages
- Client -> Server: game.start (host only)
- Client -> Server: game.fire { shotId, shooterId, pullX, pullY, firedAtMs, bullet }
- Server -> Client: game.started { config, state, physicsStat }
- Server -> Client: game.state { config, state, physicsStat }
- Server -> Client: game.shot { shot, state, physicsStat }

Bullet types
- normal: regular projectile, energy cost 20.
- move: no projectile is spawned; the shooter gains bullet-like velocity, costs 30 energy.
- move bullets bounce when the player's collider touches map boundaries.

Realtime sync
- Backend pushes authoritative `game.state` every 50ms.
- `physicsStat` is the source of truth for projectile simulation state.
- Frontend should update local renderer/simulation from `physicsStat` and treat backend as authority.

State
- ClassicBattleState keeps player positions, HP, energy, energy update timestamp, and winnerId.
- Default config values (set in constructor): HP 100, Energy 100, regen 5/s, shot cost 20, damage 20.

Hit and damage timing
- Damage is applied when projectile collision is detected in physics callbacks (`onCollide`).
- Firing a shot only creates projectile state; it does not instantly decide hit result.
