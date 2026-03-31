<script setup lang="ts">
interface RoomPlayerView {
  id: string;
  name: string;
  status: string;
}

defineProps<{
  players: RoomPlayerView[];
}>();
</script>

<template>
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
</template>

<style scoped>
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
</style>
