<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_MODE_OPTIONS,
  type RoomMemberSummary,
  type RoomMode,
  type RoomSettingsSummary,
} from 'shared';

const props = defineProps<{
  settings: RoomSettingsSummary;
  players: RoomMemberSummary[];
  isHost: boolean;
  currentSessionId: string;
  isSaving: boolean;
  isTransferring: boolean;
  errorMessage: string;
}>();

const emit = defineEmits<{
  'save-settings': [payload: { roomName: string; mode: RoomMode; maxPlayers: number; password: string }];
  'transfer-host': [payload: { targetSessionId: string }];
}>();

const form = reactive({
  roomName: '',
  mode: 'classic' as RoomMode,
  maxPlayers: 8,
  password: '',
});

const transferCandidates = computed(() =>
  props.players.filter((player) => player.sessionId !== props.currentSessionId),
);
const transferTarget = ref('');
const hasInitializedForm = ref(false);
const showPassword = ref(false);

const isDirty = computed(() => {
  if (!hasInitializedForm.value) {
    return false;
  }

  return (
    form.roomName !== props.settings.roomName ||
    form.mode !== props.settings.mode ||
    form.maxPlayers !== props.settings.maxPlayers ||
    form.password.trim().length > 0
  );
});

watch(
  () => props.settings,
  (settings) => {
    if (props.isHost && isDirty.value) {
      return;
    }

    form.roomName = settings.roomName;
    form.mode = settings.mode;
    form.maxPlayers = clampPlayers(settings.maxPlayers);
    form.password = settings.password;
    hasInitializedForm.value = true;
  },
  { immediate: true, deep: true },
);

watch(
  transferCandidates,
  (candidates) => {
    if (!candidates.find((candidate) => candidate.sessionId === transferTarget.value)) {
      transferTarget.value = candidates[0]?.sessionId ?? '';
    }
  },
  { immediate: true },
);

function onSaveSettings(): void {
  if (!props.isHost || props.isSaving) {
    return;
  }

  emit('save-settings', {
    roomName: form.roomName,
    mode: form.mode,
    maxPlayers: form.maxPlayers,
    password: form.password,
  });
}

function clampPlayers(value: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : ROOM_MIN_PLAYERS;
  return Math.min(ROOM_MAX_PLAYERS, Math.max(ROOM_MIN_PLAYERS, normalized));
}

function increasePlayers(): void {
  if (!props.isHost || props.isSaving) {
    return;
  }

  form.maxPlayers = clampPlayers(form.maxPlayers + 1);
}

function decreasePlayers(): void {
  if (!props.isHost || props.isSaving) {
    return;
  }

  form.maxPlayers = clampPlayers(form.maxPlayers - 1);
}

function onTransferHost(): void {
  if (!props.isHost || props.isTransferring) {
    return;
  }

  const targetSessionId = transferTarget.value;
  if (!targetSessionId) {
    return;
  }

  emit('transfer-host', { targetSessionId });
}

function togglePasswordVisibility(): void {
  showPassword.value = !showPassword.value;
}
</script>

<template>
  <section class="panel settings-panel">
    <h2>房間設定</h2>

    <div class="form-grid">
      <label>
        房間名稱
        <input v-model="form.roomName" :disabled="!isHost || isSaving" type="text" />
      </label>

      <label>
        遊戲模式
        <select v-model="form.mode" :disabled="!isHost || isSaving">
          <option v-for="modeOption in ROOM_MODE_OPTIONS" :key="modeOption.id" :value="modeOption.id">
            {{ modeOption.label }}
          </option>
        </select>
      </label>

      <label>
        房間上限
        <div class="max-player-control" :class="{ disabled: !isHost || isSaving }">
          <button type="button" class="step-btn" :disabled="!isHost || isSaving" @click="decreasePlayers">
            -
          </button>
          <strong>{{ form.maxPlayers }}</strong>
          <button type="button" class="step-btn" :disabled="!isHost || isSaving" @click="increasePlayers">
            +
          </button>
        </div>
      </label>

      <label>
        房間密碼
        <div class="password-control">
          <input
            v-model="form.password"
            :disabled="!isHost || isSaving"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="isHost ? '留空代表無密碼' : ''"
          />
          <button type="button" class="ghost" @click="togglePasswordVisibility">
            {{ showPassword ? '隱藏' : '顯示' }}
          </button>
        </div>
      </label>
    </div>

    <p v-if="!isHost" class="read-only-tip">目前為唯讀模式，僅房主可修改設定。</p>
    <p v-else class="password-tip">目前密碼狀態：{{ settings.hasPassword ? '已設定' : '無密碼' }}</p>

    <button v-if="isHost" type="button" class="primary" :disabled="isSaving" @click="onSaveSettings">
      {{ isSaving ? '儲存中...' : '儲存設定' }}
    </button>

    <div v-if="isHost" class="transfer-block">
      <h3>移交房主</h3>
      <div class="transfer-row">
        <select v-model="transferTarget" :disabled="isTransferring || transferCandidates.length === 0">
          <option
            v-for="candidate in transferCandidates"
            :key="candidate.sessionId"
            :value="candidate.sessionId"
          >
            {{ candidate.nickname }}
          </option>
        </select>
        <button
          type="button"
          class="danger"
          :disabled="isTransferring || transferCandidates.length === 0"
          @click="onTransferHost"
        >
          {{ isTransferring ? '移交中...' : '移交房主' }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.settings-panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.24rem;
}

.form-grid {
  display: grid;
  gap: 0.65rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--color-text-secondary);
}

input,
select {
  border: 1px solid var(--color-input-border);
  border-radius: 0.7rem;
  padding: 0 0.75rem;
  height: 2.5rem;
  font: inherit;
  color: var(--color-text-primary);
  background: rgba(8, 15, 30, 0.8);
}

.password-control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.6rem;
  align-items: center;
}

.password-control input {
  height: 2.5rem;
}

.max-player-control {
  border: 1px solid var(--color-input-border);
  border-radius: 0.7rem;
  min-height: 3rem;
  display: grid;
  grid-template-columns: 3.2rem 1fr 3.2rem;
  align-items: stretch;
  overflow: hidden;
  background: rgba(8, 15, 30, 0.8);
}

.max-player-control strong {
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  font-family: var(--font-heading);
}

.step-btn {
  margin: 0;
  height: 100%;
  border-radius: 0;
  border: 0;
  border-right: 1px solid rgba(121, 145, 188, 0.25);
  background: rgba(25, 42, 76, 0.9);
  color: #d7e7ff;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
}

.step-btn:last-child {
  border-right: 0;
  border-left: 1px solid rgba(121, 145, 188, 0.25);
}

.max-player-control.disabled {
  opacity: 0.7;
}

button {
  margin-top: 0.75rem;
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

button.ghost {
  color: #cfe2ff;
  border-color: rgba(121, 145, 188, 0.4);
  background: rgba(11, 21, 41, 0.6);
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.read-only-tip,
.password-tip {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.transfer-block {
  margin-top: 1rem;
  border-top: 1px solid rgba(121, 145, 188, 0.25);
  padding-top: 0.8rem;
}

.transfer-block h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.transfer-row {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: 1fr;
}

.error-message {
  margin: 0.8rem 0 0;
  color: #ff9f9f;
  font-size: 0.9rem;
}

@media (min-width: 560px) {
  .transfer-row {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}
</style>
