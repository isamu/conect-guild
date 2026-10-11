<script setup lang="ts">
import type { GuildMessage } from '../app/messageQueue';

defineProps<{
  /** The head of the queue; null when nothing new happened. */
  message: GuildMessage | null;
  /** Messages waiting after this one. */
  remaining: number;
}>();

const emit = defineEmits<{ next: [] }>();
</script>

<template>
  <section class="rpg-window message" aria-label="メッセージ" aria-live="polite">
    <p v-if="message === null" class="message__text message__text--idle">
      あたらしい できごとは まだ ない。
    </p>
    <p v-else :key="message.id" class="message__text">{{ message.text }}</p>
    <button
      v-if="message !== null"
      type="button"
      class="message__next"
      :aria-label="remaining > 0 ? `つぎへ（あと ${remaining} 件）` : 'とじる'"
      @click="emit('next')"
    >
      ▼<span v-if="remaining > 0" class="message__count">{{ remaining }}</span>
    </button>
  </section>
</template>

<style scoped>
.message {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.6em 3em 0.6em 1.2em;
  background: #05071a;
}

.message__text {
  margin: 0;
  font-size: 1.45em;
  font-weight: 700;
  letter-spacing: 0.05em;
  overflow-wrap: anywhere;
  animation: message-in 0.35s steps(6, end);
}

.message__text--idle {
  color: var(--muted-text);
  font-size: 1.15em;
  animation: none;
}

.message__next {
  position: absolute;
  right: 0.6em;
  bottom: 0.3em;
  font: inherit;
  font-size: 1.1em;
  color: #fff;
  background: none;
  border: none;
  cursor: pointer;
  animation: blink 1s steps(2, start) infinite;
}

.message__next:focus-visible {
  outline: 0.1em solid var(--accent);
}

.message__count {
  margin-left: 0.2em;
  font-size: 0.6em;
}

@keyframes message-in {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message__text,
  .message__next {
    animation: none;
  }
}
</style>
