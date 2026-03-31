<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    confirmLabel?: string;
    initialValue?: string;
    errorMessage?: string;
  }>(),
  {
    message: '',
    placeholder: '',
    confirmLabel: '確認',
    initialValue: '',
    errorMessage: '',
  },
);

const emit = defineEmits<{
  confirm: [value: string];
}>();

const inputValue = ref(props.initialValue);
const showDialog = computed(() => props.open);

watch(
  () => props.open,
  (value) => {
    if (value) {
      inputValue.value = props.initialValue;
    }
  },
  { immediate: true },
);

watch(
  () => props.initialValue,
  (value) => {
    if (props.open) {
      inputValue.value = value;
    }
  },
);

function onConfirm(): void {
  emit('confirm', inputValue.value);
}
</script>

<template>
  <div v-if="showDialog" class="prompt-mask">
    <div class="prompt-dialog">
      <h2>{{ title }}</h2>
      <p v-if="message">{{ message }}</p>
      <input
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        @keydown.enter="onConfirm"
      />
      <p v-if="errorMessage" class="prompt-error">{{ errorMessage }}</p>
      <button type="button" @click="onConfirm">{{ confirmLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.prompt-mask {
  position: fixed;
  inset: 0;
  background: rgba(6, 10, 20, 0.7);
  display: grid;
  place-items: center;
  z-index: 20;
}

.prompt-dialog {
  width: min(420px, calc(100% - 2rem));
  background: var(--color-surface-1);
  border: 1px solid rgba(109, 152, 227, 0.35);
  border-radius: 1rem;
  padding: 1.5rem;
  display: grid;
  gap: 0.75rem;
  box-shadow: 0 24px 60px rgba(6, 10, 20, 0.55);
}

.prompt-dialog h2 {
  margin: 0;
  font-family: var(--font-heading);
}

.prompt-dialog p {
  margin: 0;
  color: var(--color-text-secondary);
}

.prompt-dialog input {
  border-radius: 0.75rem;
  border: 1px solid var(--color-input-border);
  background: rgba(10, 18, 33, 0.7);
  color: var(--color-text-primary);
  padding: 0.7rem 0.9rem;
  font: inherit;
}

.prompt-dialog button {
  border: none;
  border-radius: 0.75rem;
  padding: 0.65rem 1rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: #11182e;
  background: linear-gradient(120deg, #8fd1ff, #ffb085);
}

.prompt-error {
  color: #ffb0b0;
  font-size: 0.9rem;
}
</style>
