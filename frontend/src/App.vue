<script setup lang="ts">
import { ref } from 'vue';
import Lobby from './lobby/Lobby.vue';
import WaitingRoom from './room/WaitingRoom.vue';
import type { JoinedRoomView } from './room/roomService';

const joinedRoom = ref<JoinedRoomView | null>(null);

function handleRoomCreated(room: JoinedRoomView): void {
  joinedRoom.value = room;
}

function handleRoomJoined(room: JoinedRoomView): void {
  joinedRoom.value = room;
}

function handleLeaveRoom(): void {
  joinedRoom.value = null;
}
</script>

<template>
  <Lobby
    v-if="!joinedRoom"
    @room-created="handleRoomCreated"
    @room-joined="handleRoomJoined"
  />
  <WaitingRoom
    v-else
    :room="joinedRoom"
    @leave-room="handleLeaveRoom"
  />
</template>