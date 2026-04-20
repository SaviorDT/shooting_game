<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  ClassicBattleConfig,
  ClassicBattleState,
  simulateClassicBattleShot,
  type ClassicBattleShotPayload,
  type ClassicBattleStatePayload,
} from 'shared';
import { getActiveRoom, sendRoomMessage } from '../roomService';
import { ClassicBattleGame, type ClassicBattleFirePayload } from './ClassicBattle';

const props = defineProps<{
  players: Array<{ id: string; name: string; color?: number }>;
  config: ClassicBattleConfig | null;
  state: ClassicBattleState | null;
  sessionId: string;
}>();

const emit = defineEmits<{
  'exit-game': [];
}>();

const gameRoot = ref<HTMLDivElement | null>(null);
const currentState = ref<ClassicBattleState | null>(props.state);
const currentConfig = ref<ClassicBattleConfig | null>(props.config);
let game: ClassicBattleGame | null = null;
let pendingShotId: string | null = null;
let isMounted = true;

const playerColors = computed(() => {
  const palette: Record<string, number> = {};
  props.players.forEach((player, index) => {
    palette[player.id] = player.color ?? (index === 0 ? 0x8fd1ff : 0xffb085);
  });
  return palette;
});

const winnerName = computed(() => {
  const state = currentState.value;
  if (!state?.winnerId) {
    return '';
  }
  return state.players.find((player) => player.id === state.winnerId)?.name ?? '勝利者';
});

const isGameOver = computed(() => Boolean(currentState.value?.winnerId));

function handleFire(payload: ClassicBattleFirePayload): void {
  const config = currentConfig.value;
  const state = currentState.value;
  if (!config || !state) {
    return;
  }

  const shotId = createShotId();
  const firedAtMs = Date.now();
  const result = simulateClassicBattleShot(config, state, {
    shotId,
    shooterId: payload.shooterId,
    pullX: payload.pullX,
    pullY: payload.pullY,
    firedAtMs,
  });

  if ('error' in result) {
    return;
  }

  pendingShotId = shotId;
  currentState.value = result.state;
  game?.playShot(result.shot, result.state);
  sendRoomMessage('game.fire', {
    shotId,
    shooterId: payload.shooterId,
    pullX: payload.pullX,
    pullY: payload.pullY,
    firedAtMs,
  });
}

function applyStatePayload(payload: ClassicBattleStatePayload): void {
  if (!isMounted || !payload?.state || !payload?.config) {
    return;
  }

  currentConfig.value = new ClassicBattleConfig(payload.config);
  currentState.value = new ClassicBattleState(payload.state);
  if (game && currentState.value) {
    game.setState(currentState.value);
  }
}

function applyShotPayload(payload: ClassicBattleShotPayload): void {
  if (!isMounted || !payload?.state || !payload?.shot) {
    return;
  }

  const nextState = new ClassicBattleState(payload.state);
  currentState.value = nextState;

  if (pendingShotId && payload.shot.shotId === pendingShotId) {
    pendingShotId = null;
    game?.setState(nextState);
    return;
  }

  game?.playShot(payload.shot, nextState);
}

onMounted(() => {
  isMounted = true;
  document.body.classList.add('no-scroll');
  const room = getActiveRoom();
  room?.onMessage('game.started', applyStatePayload);
  room?.onMessage('game.state', applyStatePayload);
  room?.onMessage('game.shot', applyShotPayload);

  if (!gameRoot.value || !currentConfig.value || !currentState.value) {
    return;
  }

  game = new ClassicBattleGame({
    parent: gameRoot.value,
    config: currentConfig.value,
    state: currentState.value,
    localPlayerId: props.sessionId,
    onFire: handleFire,
    playerColors: playerColors.value,
    backgroundColor: '#0a1021',
  });
});

onUnmounted(() => {
  isMounted = false;
  document.body.classList.remove('no-scroll');
  if (game) {
    game.destroy();
    game = null;
  }
});

watch(
  () => props.state,
  (value) => {
    if (!value) {
      return;
    }
    currentState.value = value;
    game?.setState(value);
  },
);

watch(
  () => props.config,
  (value) => {
    if (!value) {
      return;
    }
    currentConfig.value = value;
  },
);

function exitGame(): void {
  emit('exit-game');
}

function createShotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}
</script>

<template>
  <section class="game-page">
    <div class="game-stage">
      <div ref="gameRoot" class="game-root"></div>
    </div>

    <div v-if="isGameOver" class="game-result">
      <div class="result-card">
        <h2>{{ winnerName }} 勝利！</h2>
        <p>戰局已結束，返回房間準備下一場對戰。</p>
        <button type="button" class="primary" @click="exitGame">返回房間</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.game-page {
  height: 100vh;
  width: 100vw;
  margin: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(circle at top, rgba(48, 128, 207, 0.2), transparent 55%),
    linear-gradient(180deg, #0a1021, #070c19);
}

.game-stage {
  width: min(100vw, 520px);
  height: min(100vh, 860px);
  display: grid;
  place-items: center;
}

.game-root {
  width: 100%;
  height: 100%;
  aspect-ratio: 5 / 8;
}

.game-result {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 18, 0.7);
  display: grid;
  place-items: center;
  z-index: 10;
  padding: 1.5rem;
}

.result-card {
  width: min(420px, 100%);
  background: rgba(10, 16, 30, 0.95);
  border: 1px solid rgba(136, 164, 220, 0.4);
  border-radius: 1rem;
  padding: 1.5rem;
  text-align: center;
  display: grid;
  gap: 0.7rem;
}

.result-card h2 {
  margin: 0;
  font-family: var(--font-heading);
}

.result-card p {
  margin: 0;
  color: var(--color-text-secondary);
}

button {
  border: 1px solid var(--color-input-border);
  border-radius: 0.72rem;
  padding: 0 1rem;
  height: 2.6rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.primary {
  color: #11182e;
  background: linear-gradient(120deg, #8fd1ff, #ffb085);
}

:global(body.no-scroll) {
  overflow: hidden;
}
</style>
