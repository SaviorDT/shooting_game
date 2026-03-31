<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Lobby from './lobby/Lobby.vue';
import WaitingRoom from './room/WaitingRoom.vue';
import type { JoinedRoomView } from './room/roomService';
import PromptDialog from './app/components/PromptDialog.vue';

const joinedRoom = ref<JoinedRoomView | null>(null);
const pendingJoin = ref<{ roomId: string; password?: string } | null>(null);
const nicknameError = ref('');
const confirmedNickname = ref('');

function updateRoomUrl(roomId: string, password?: string): void {
  const url = new URL(window.location.href);
  url.pathname = '/room';
  url.searchParams.set('room_ID', roomId);
  url.searchParams.set('room_password', password ?? '');
  window.history.pushState({}, '', url);
}

function resetRoomUrl(): void {
  window.history.pushState({}, '', '/');
}

function handleRoomCreated(payload: { room: JoinedRoomView; password?: string }): void {
  joinedRoom.value = payload.room;
  updateRoomUrl(payload.room.roomId, payload.password);
}

function handleRoomJoined(payload: { room: JoinedRoomView; password?: string }): void {
  joinedRoom.value = payload.room;
  updateRoomUrl(payload.room.roomId, payload.password);
}

function handleLeaveRoom(): void {
  joinedRoom.value = null;
  pendingJoin.value = null;
  confirmedNickname.value = '';
  nicknameError.value = '';
  resetRoomUrl();
}

function confirmNickname(value: string): void {
  const trimmed = value.trim();

  if (!trimmed) {
    nicknameError.value = '請輸入暱稱後再繼續。';
    return;
  }

  confirmedNickname.value = trimmed;
  nicknameError.value = '';
}

onMounted(() => {
  const url = new URL(window.location.href);
  if (url.pathname === '/room') {
    const roomId = url.searchParams.get('room_ID')?.trim();
    const password = url.searchParams.get('room_password')?.trim() ?? '';

    if (roomId) {
      pendingJoin.value = { roomId, password };
    }
  }
});
</script>

<template>
  <Lobby
    v-if="!joinedRoom"
    :initial-nickname="confirmedNickname"
    :initial-room-id="pendingJoin?.roomId ?? ''"
    :initial-password="pendingJoin?.password ?? ''"
    :auto-join="Boolean(pendingJoin?.roomId && confirmedNickname)"
    @room-created="handleRoomCreated"
    @room-joined="handleRoomJoined"
  />
  <WaitingRoom
    v-else
    :room="joinedRoom"
    @leave-room="handleLeaveRoom"
  />
  <PromptDialog
    :open="Boolean(pendingJoin?.roomId) && !confirmedNickname"
    title="輸入暱稱"
    message="加入房間前請先設定暱稱。"
    placeholder="例如：SharpShooter_01"
    confirm-label="確認"
    :error-message="nicknameError"
    @confirm="confirmNickname"
  />
</template>