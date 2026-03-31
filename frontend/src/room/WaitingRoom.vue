<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getRoomModeLabel, type RoomMemberSummary, type RoomMode } from 'shared';
import { getRoomMembers, leaveRoom } from './roomService';

interface WaitingRoomView {
  roomId: string;
  roomName: string;
  mode: RoomMode;
  sessionId: string;
  nickname: string;
  isHost: boolean;
}

const props = defineProps<{
  room: WaitingRoomView;
}>();

const emit = defineEmits<{
  'leave-room': [];
}>();

const members = ref<RoomMemberSummary[]>([]);
const isLeaving = ref(false);

const players = computed(() =>
  members.value.map((member) => ({
    id: member.sessionId,
    name: member.nickname,
    status: member.isHost ? '房主' : '已加入',
  })),
);

const actionLabel = computed(() => (props.room.isHost ? '開始遊戲' : '準備'));

async function onLeaveRoom(): Promise<void> {
  if (isLeaving.value) {
    return;
  }

  isLeaving.value = true;
  emit('leave-room');

  try {
    await leaveRoom({
      roomId: props.room.roomId,
      sessionId: props.room.sessionId,
    });
  } catch (error) {
    console.error('Failed to leave room', error);
  } finally {
    isLeaving.value = false;
  }
}

async function fetchRoomMembers(): Promise<void> {
  try {
    members.value = await getRoomMembers(props.room.roomId);
  } catch {
    // Keep previous member list if polling fails temporarily.
  }
}

let refreshTimer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  await fetchRoomMembers();
  refreshTimer = setInterval(() => {
    void fetchRoomMembers();
  }, 2000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
</script>

<template>
  <div class="waiting-page">
    <main class="waiting-shell">
      <header class="waiting-header panel">
        <p class="badge">Room Lobby</p>
        <h1>等待房間</h1>
        <p class="subtitle">
          房間名稱：{{ room.roomName }} ・ 模式：{{ getRoomModeLabel(room.mode) }}
        </p>
      </header>

      <section class="actions panel">
        <div class="room-meta">
          <p class="room-id-label">房間 ID</p>
          <strong>{{ room.roomId }}</strong>
        </div>

        <div class="buttons">
          <button type="button" class="primary">{{ actionLabel }}</button>
          <button type="button" class="danger" :disabled="isLeaving" @click="onLeaveRoom">
            {{ isLeaving ? '離開中...' : '離開房間' }}
          </button>
        </div>
      </section>

      <div class="panel-grid">
        <section class="panel">
          <div class="section-head">
            <h2>玩家列表</h2>
            <span>{{ players.length }} 人</span>
          </div>

          <ul class="player-list">
            <li v-for="player in players" :key="player.id">
              <div>
                <strong>{{ player.name }}</strong>
                <p>{{ player.status }}</p>
              </div>
            </li>
          </ul>
        </section>

        <section class="panel settings-panel">
          <h2>房間設定</h2>
          <div class="settings-placeholder">
            設定面板預留中
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.waiting-page {
  min-height: 100vh;
  padding: 2rem 1rem 2.5rem;
}

.waiting-shell {
  width: min(980px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.panel {
  background: var(--color-surface-2);
  border: 1px solid var(--color-surface-border);
  border-radius: 1rem;
  padding: 1rem;
  backdrop-filter: blur(6px);
}

.waiting-header {
  background: var(--color-surface-1);
}

.badge {
  display: inline-block;
  margin: 0;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(160, 206, 255, 0.5);
  color: #c5e2ff;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1,
h2,
strong {
  font-family: var(--font-heading);
}

h1 {
  margin: 0.65rem 0 0.4rem;
  font-size: clamp(1.8rem, 3.5vw, 2.45rem);
}

.subtitle {
  margin: 0;
  color: var(--color-text-secondary);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.room-id-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.room-meta strong {
  display: block;
  margin-top: 0.15rem;
  font-size: 1.4rem;
}

.buttons {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  justify-content: flex-end;
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

button.danger {
  color: #ffd7d7;
  border-color: rgba(219, 109, 109, 0.45);
  background: rgba(118, 33, 33, 0.72);
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.panel-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
}

.section-head h2 {
  margin: 0;
}

.section-head span {
  color: #9eb7e4;
  font-size: 0.9rem;
}

.player-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

.player-list li {
  padding: 0.72rem 0.8rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(132, 153, 194, 0.3);
  background: rgba(10, 18, 33, 0.68);
}

.player-list strong {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 1.05rem;
}

.player-list p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.settings-panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.24rem;
}

.settings-placeholder {
  min-height: 12rem;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(136, 160, 210, 0.5);
  border-radius: 0.8rem;
  color: var(--color-text-muted);
  background: rgba(12, 20, 37, 0.5);
}

@media (min-width: 860px) {
  .panel-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .actions {
    flex-direction: column;
    align-items: stretch;
  }

  .buttons {
    justify-content: stretch;
  }

  button {
    width: 100%;
  }
}
</style>
