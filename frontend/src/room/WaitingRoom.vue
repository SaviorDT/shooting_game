<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ClassicBattleConfig,
  ClassicBattleState,
  getRoomModeLabel,
  type RoomMemberSummary,
  type RoomSettingsSummary,
  type ClassicBattleStatePayload,
} from 'shared';
import {
  getActiveRoom,
  getRoomMembers,
  leaveRoom,
  sendRoomMessage,
  transferHost,
  updateRoomSettings,
  type JoinedRoomView,
} from './roomService';
import RoomGame from './game/RoomGame.vue';
import RoomPlayersPanel from './components/RoomPlayersPanel.vue';
import RoomSettingsPanel from './components/RoomSettingsPanel.vue';

const props = defineProps<{
  room: JoinedRoomView;
}>();

const emit = defineEmits<{
  'leave-room': [];
}>();

const members = ref<RoomMemberSummary[]>([]);
const settings = ref<RoomSettingsSummary>({
  roomName: props.room.roomName,
  mode: props.room.mode,
  maxPlayers: props.room.maxPlayers,
  hasPassword: props.room.hasPassword,
  password: '',
});
const isLeaving = ref(false);
const isSavingSettings = ref(false);
const isTransferringHost = ref(false);
const settingsError = ref('');
const gameState = ref<ClassicBattleState | null>(null);
const gameConfig = ref<ClassicBattleConfig | null>(null);

const players = computed(() =>
  members.value.map((member) => ({
    id: member.sessionId,
    name: member.nickname,
    status: member.isHost ? '房主' : member.isReady ? '已準備' : '未準備',
    isReady: member.isReady,
  })),
);

const isCurrentUserHost = computed(() => {
  const currentMember = members.value.find((member) => member.sessionId === props.room.sessionId);
  return currentMember ? currentMember.isHost : props.room.isHost;
});

const isCurrentUserReady = computed(() => {
  const currentMember = members.value.find((member) => member.sessionId === props.room.sessionId);
  return currentMember ? currentMember.isReady : false;
});

const actionLabel = computed(() => {
  if (isCurrentUserHost.value) {
    return '開始遊戲';
  }
  return isCurrentUserReady.value ? '取消準備' : '準備';
});

const canStartGame = computed(() => {
  if (!isCurrentUserHost.value || members.value.length < 2) {
    return false;
  }
  return members.value.every((member) => member.isReady);
});
const isGameActive = computed(() => Boolean(gameState.value && gameConfig.value));

const gamePlayers = computed(() => {
  if (gameState.value) {
    return gameState.value.players.slice(0, 2).map((player, index) => ({
      id: player.id,
      name: player.name,
      color: index === 0 ? 0x8fd1ff : 0xffb085,
    }));
  }

  const fallbackMembers: RoomMemberSummary[] = [
    { sessionId: props.room.sessionId, nickname: props.room.nickname, isHost: props.room.isHost, isReady: true },
    { sessionId: 'guest-slot', nickname: '訪客玩家', isHost: false, isReady: false },
  ];
  const roster = members.value.length >= 2 ? members.value : fallbackMembers;

  return roster.slice(0, 2).map((member, index) => ({
    id: member.sessionId,
    name: member.nickname,
    color: index === 0 ? 0x8fd1ff : 0xffb085,
  }));
});

function updateRoomUrl(password: string): void {
  const url = new URL(window.location.href);
  url.pathname = '/room';
  url.searchParams.set('room_ID', props.room.roomId);
  url.searchParams.set('room_password', password ?? '');
  window.history.replaceState({}, '', url);
}

async function onLeaveRoom(): Promise<void> {
  if (isLeaving.value) {
    return;
  }

  isLeaving.value = true;
  gameState.value = null;
  gameConfig.value = null;
  emit('leave-room');

  try {
    await leaveRoom({
      roomId: props.room.roomId,
      sessionId: props.room.sessionId,
      playerToken: props.room.playerToken,
    });
  } catch (error) {
    console.error('Failed to leave room', error);
  } finally {
    isLeaving.value = false;
  }
}

function onStartGame(): void {
  if (!canStartGame.value || isGameActive.value) {
    return;
  }

  sendRoomMessage('game.start');
}

function onToggleReady(): void {
  if (isCurrentUserHost.value) {
    return;
  }

  if (isCurrentUserReady.value) {
    sendRoomMessage('player.unready');
  } else {
    sendRoomMessage('player.ready');
  }
}

function onAction(): void {
  if (isCurrentUserHost.value) {
    onStartGame();
  } else {
    onToggleReady();
  }
}

function onExitGame(): void {
  gameState.value = null;
  gameConfig.value = null;
}

async function fetchRoomMembers(): Promise<void> {
  try {
    const snapshot = await getRoomMembers(props.room.roomId);
    members.value = snapshot.members;
    settings.value = snapshot.settings;
    updateRoomUrl(snapshot.settings.password);
  } catch {
    // Keep previous member list if polling fails temporarily.
  }
}

async function onSaveSettings(payload: {
  roomName: string;
  mode: RoomSettingsSummary['mode'];
  maxPlayers: number;
  password: string;
}): Promise<void> {
  if (!isCurrentUserHost.value || isSavingSettings.value) {
    return;
  }

  settingsError.value = '';
  isSavingSettings.value = true;

  try {
    const updatedSettings = await updateRoomSettings({
      roomId: props.room.roomId,
      sessionId: props.room.sessionId,
      playerToken: props.room.playerToken,
      roomName: payload.roomName.trim(),
      mode: payload.mode,
      maxPlayers: payload.maxPlayers,
      password: payload.password.trim(),
    });

    settings.value = updatedSettings;
    updateRoomUrl(updatedSettings.password);
    await fetchRoomMembers();
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : '更新設定失敗，請稍後再試。';
  } finally {
    isSavingSettings.value = false;
  }
}

async function onTransferHost(payload: { targetSessionId: string }): Promise<void> {
  if (!isCurrentUserHost.value || isTransferringHost.value) {
    return;
  }

  settingsError.value = '';
  isTransferringHost.value = true;

  try {
    await transferHost({
      roomId: props.room.roomId,
      sessionId: props.room.sessionId,
      playerToken: props.room.playerToken,
      targetSessionId: payload.targetSessionId,
    });

    await fetchRoomMembers();
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : '移交房主失敗，請稍後再試。';
  } finally {
    isTransferringHost.value = false;
  }
}

let refreshTimer: ReturnType<typeof setInterval> | undefined;
let isMounted = true;

function applyGameState(payload: ClassicBattleStatePayload): void {
  if (!isMounted || !payload?.state || !payload?.config) {
    return;
  }

  gameConfig.value = new ClassicBattleConfig(payload.config);
  gameState.value = new ClassicBattleState(payload.state);
}

onMounted(async () => {
  isMounted = true;
  const activeRoom = getActiveRoom();
  activeRoom?.onMessage('game.started', applyGameState);
  activeRoom?.onMessage('game.state', applyGameState);
  activeRoom?.onMessage('players.status', (data: { members: RoomMemberSummary[] }) => {
    if (isMounted) {
      members.value = data.members;
    }
  });

  await fetchRoomMembers();
  refreshTimer = setInterval(() => {
    void fetchRoomMembers();
  }, 2000);
});

onUnmounted(() => {
  isMounted = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
</script>

<template>
  <RoomGame
    v-if="isGameActive"
    :players="gamePlayers"
    :config="gameConfig"
    :state="gameState"
    :session-id="room.sessionId"
    @exit-game="onExitGame"
  />
  <div v-else class="waiting-page">
    <main class="waiting-shell">
      <header class="waiting-header panel">
        <p class="badge">Room Lobby</p>
        <h1>等待房間</h1>
        <p class="subtitle">
          房間名稱：{{ settings.roomName }} ・ 模式：{{ getRoomModeLabel(settings.mode) }}
        </p>
      </header>

      <section class="actions panel">
        <div class="room-meta">
          <p class="room-id-label">房間 ID</p>
          <strong>{{ room.roomId }}</strong>
        </div>

        <div class="buttons">
          <button type="button" class="primary" :disabled="isCurrentUserHost ? !canStartGame : false" @click="onAction">
            {{ actionLabel }}
          </button>
          <button type="button" class="danger" :disabled="isLeaving" @click="onLeaveRoom">
            {{ isLeaving ? '離開中...' : '離開房間' }}
          </button>
        </div>
      </section>

      <div class="panel-grid">
        <RoomPlayersPanel :players="players" class="panel" />
        <RoomSettingsPanel
          class="panel"
          :settings="settings"
          :players="members"
          :is-host="isCurrentUserHost"
          :current-session-id="room.sessionId"
          :is-saving="isSavingSettings"
          :is-transferring="isTransferringHost"
          :error-message="settingsError"
          @save-settings="onSaveSettings"
          @transfer-host="onTransferHost"
        />
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
