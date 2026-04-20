Classic battle (shared game logic)

Core logic lives in shared so backend is authoritative and frontend can predict.

Messages
- Client -> Server: game.start (host only)
- Client -> Server: game.fire { shotId, shooterId, pullX, pullY, firedAtMs? }
- Server -> Client: game.started { config, state }
- Server -> Client: game.state { config, state }
- Server -> Client: game.shot { shot, state }

State
- ClassicBattleState keeps player positions, HP, energy, energy update timestamp, and winnerId.
- Default config values (set in constructor): HP 100, Energy 100, regen 5/s, shot cost 20, damage 20.
- simulateClassicBattleShot() is deterministic and should be used by both frontend and backend.
