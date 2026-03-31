<script setup lang="ts">
import { ref } from 'vue';
import { ROOM_MODE_OPTIONS, isRoomMode, type RoomMode } from 'shared';
import { createRoom, joinRoom, type JoinedRoomView } from '../room/roomService';

const emit = defineEmits<{
  'room-created': [payload: JoinedRoomView];
  'room-joined': [payload: JoinedRoomView];
}>();

const nickname = ref('');
const roomName = ref('');
const roomMode = ref<RoomMode>('classic');
const isCreating = ref(false);
const formError = ref('');
const joinRoomId = ref('');
const joinPassword = ref('');
const isJoining = ref(false);
const joinError = ref('');

async function onCreateRoom(): Promise<void> {
  if (isCreating.value) {
    return;
  }

  formError.value = '';

  const trimmedNickname = nickname.value.trim();
  const trimmedRoomName = roomName.value.trim();

  if (!trimmedNickname || !trimmedRoomName) {
    formError.value = '請先填寫暱稱與房間名稱。';
    return;
  }

  if (!isRoomMode(roomMode.value)) {
    formError.value = '請選擇有效的遊戲模式。';
    return;
  }

  isCreating.value = true;

  try {
    const joinedRoom = await createRoom({
      nickname: trimmedNickname,
      roomName: trimmedRoomName,
      mode: roomMode.value,
    });

    emit('room-created', joinedRoom);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '創建房間失敗，請稍後再試。';
  } finally {
    isCreating.value = false;
  }
}

async function onJoinRoom(): Promise<void> {
  if (isJoining.value) {
    return;
  }

  joinError.value = '';

  const trimmedNickname = nickname.value.trim();
  const trimmedRoomId = joinRoomId.value.trim();
  const trimmedPassword = joinPassword.value.trim();

  if (!trimmedNickname || !trimmedRoomId) {
    joinError.value = '請先填寫暱稱與房間 ID。';
    return;
  }

  isJoining.value = true;

  try {
    const joinedRoom = await joinRoom({
      nickname: trimmedNickname,
      roomId: trimmedRoomId,
      password: trimmedPassword || undefined,
    });

    emit('room-joined', joinedRoom);
  } catch (error) {
    joinError.value = error instanceof Error ? error.message : '加入房間失敗，請稍後再試。';
  } finally {
    isJoining.value = false;
  }
}
</script>

<template>
  <div class="lobby-page">
    <div class="aurora aurora-left"></div>
    <div class="aurora aurora-right"></div>

    <main class="lobby-shell">
      <header class="lobby-header">
        <p class="badge">Realtime Arena</p>
        <h1>備戰大廳</h1>
        <p class="subtitle">
          設定暱稱後，建立新房間或加入現有房間。
        </p>
      </header>

      <section class="panel player-panel">
        <h2>玩家設定</h2>
        <label for="nickname">暱稱</label>
        <input
          id="nickname"
          v-model="nickname"
          type="text"
          placeholder="例如：SharpShooter_01"
        />
      </section>

      <div class="action-grid">
        <section class="panel">
          <h2>創建房間</h2>
          <label for="room-name">房間名稱</label>
          <input
            id="room-name"
            v-model="roomName"
            type="text"
            placeholder="輸入房間名稱"
          />

          <label for="room-mode">遊戲模式</label>
          <select id="room-mode" v-model="roomMode">
            <option v-for="modeOption in ROOM_MODE_OPTIONS" :key="modeOption.id" :value="modeOption.id">
              {{ modeOption.label }}
            </option>
          </select>

          <button type="button" :disabled="isCreating" @click="onCreateRoom">
            {{ isCreating ? '建立中...' : '建立房間' }}
          </button>
          <p v-if="formError" class="form-error">{{ formError }}</p>
        </section>

        <section class="panel">
          <h2>加入房間</h2>
          <label for="room-id">房間 ID</label>
          <input id="room-id" v-model="joinRoomId" type="text" placeholder="例如：123" />

          <label for="password">密碼（選填）</label>
          <input id="password" v-model="joinPassword" type="text" placeholder="輸入密碼" />

          <button type="button" class="secondary" :disabled="isJoining" @click="onJoinRoom">
            {{ isJoining ? '加入中...' : '加入房間' }}
          </button>
          <p v-if="joinError" class="form-error">{{ joinError }}</p>
        </section>
      </div>

      <section class="panel room-list-panel">
        <div class="room-list-header">
          <h2>公開房間</h2>
          <span class="room-count">3 個房間</span>
        </div>

        <ul class="room-list">
          <li>
            <div>
              <strong>新手練習場</strong>
              <p>模式：經典對戰 ・ 玩家：2/8</p>
            </div>
            <button type="button" class="tiny">加入</button>
          </li>
          <li>
            <div>
              <strong>夜襲行動</strong>
              <p>模式：團隊死鬥 ・ 玩家：6/10</p>
            </div>
            <button type="button" class="tiny">加入</button>
          </li>
          <li>
            <div>
              <strong>鋼鐵要塞</strong>
              <p>模式：佔點模式 ・ 玩家：4/6</p>
            </div>
            <button type="button" class="tiny">加入</button>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.lobby-page {
  position: relative;
  min-height: 100vh;
  padding: 2rem 1rem 2.5rem;
  overflow: hidden;
}

.aurora {
  position: absolute;
  width: 22rem;
  height: 22rem;
  border-radius: 999px;
  filter: blur(60px);
  opacity: 0.45;
  pointer-events: none;
  animation: float 8s ease-in-out infinite;
}

.aurora-left {
  left: -6rem;
  top: -4rem;
  background: #2f8ee8;
}

.aurora-right {
  right: -6rem;
  bottom: -6rem;
  background: #ff7b45;
  animation-delay: 1.6s;
}

.lobby-shell {
  position: relative;
  z-index: 1;
  width: min(980px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.lobby-header {
  background: var(--color-surface-1);
  border: 1px solid rgba(109, 152, 227, 0.35);
  border-radius: 1rem;
  padding: 1.2rem 1.25rem;
  backdrop-filter: blur(6px);
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
  line-height: 1.5;
}

.panel {
  background: var(--color-surface-2);
  border: 1px solid var(--color-surface-border);
  border-radius: 1rem;
  padding: 1rem 1rem 1.05rem;
  backdrop-filter: blur(6px);
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.24rem;
}

label {
  display: block;
  margin: 0.25rem 0 0.4rem;
  color: var(--color-text-secondary);
  font-size: 0.92rem;
}

input,
select,
button {
  width: 100%;
  border: 1px solid var(--color-input-border);
  border-radius: 0.72rem;
  font: inherit;
}

input,
select {
  height: 2.7rem;
  margin-bottom: 0.75rem;
  padding: 0 0.85rem;
  color: var(--color-text-primary);
  background: var(--color-input-bg);
}

button {
  margin-top: 0.15rem;
  height: 2.7rem;
  color: #11182e;
  background: linear-gradient(120deg, #8fd1ff, #ffb085);
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

button.secondary {
  color: #d4e1ff;
  background: linear-gradient(120deg, rgba(88, 116, 181, 0.9), rgba(56, 84, 140, 0.9));
}

.action-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.room-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.room-count {
  color: #9eb7e4;
  font-size: 0.9rem;
}

.room-list {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

.room-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 0.72rem 0.8rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(132, 153, 194, 0.3);
  background: rgba(10, 18, 33, 0.68);
}

.room-list strong {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 1.05rem;
}

.room-list p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

button.tiny {
  width: auto;
  min-width: 4.6rem;
  height: 2.1rem;
  padding: 0 0.9rem;
  color: #d8e6ff;
  border-color: rgba(119, 147, 207, 0.55);
  background: rgba(31, 60, 116, 0.7);
}

.form-error {
  margin: 0.6rem 0 0;
  color: #ffc1c1;
  font-size: 0.88rem;
}

@media (min-width: 860px) {
  .action-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-22px);
  }
}
</style>
