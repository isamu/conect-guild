<script setup lang="ts">
defineProps<{
  /** True while a rule-changing PR waits for the president. */
  waiting: boolean;
  /** Tooltip text. */
  detail: string | null;
}>();
</script>

<template>
  <!-- Always drawn: it also covers the 承認まち bubble painted into the concept art. -->
  <div class="bubble" :class="{ 'bubble--waiting': waiting }" :title="detail ?? undefined">
    {{ waiting ? '承認まち' : '……' }}
  </div>
</template>

<style scoped>
.bubble {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  background: #fff;
  color: #222;
  border: 0.15em solid #222;
  border-radius: 0.8em;
  font-weight: 700;
  font-size: 1.15em;
  letter-spacing: 0.08em;
}

/* The tail points down-left to the king. */
.bubble::after {
  content: '';
  position: absolute;
  left: 18%;
  bottom: -0.55em;
  border-width: 0.6em 0.5em 0 0;
  border-style: solid;
  border-color: #222 transparent transparent;
}

.bubble--waiting {
  color: #b0103a;
  animation: bob 1.2s ease-in-out infinite;
}

@keyframes bob {
  50% {
    transform: translateY(-0.15em);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bubble--waiting {
    animation: none;
  }
}
</style>
