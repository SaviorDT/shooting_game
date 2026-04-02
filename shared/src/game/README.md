Classic battle (shared game logic)

Core logic lives in shared so backend is authoritative and frontend can predict.

Messages
- Client -> Server: game.start (host only)
- Client -> Server: game.fire { shotId, shooterId, pullX, pullY }
- Server -> Client: game.started { config, state }
- Server -> Client: game.state { config, state }
- Server -> Client: game.shot { shot, state }

State
- ClassicBattleState keeps player positions, HP, active player, and winnerId.
- simulateClassicBattleShot() is deterministic and should be used by both frontend and backend.
