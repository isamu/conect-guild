<script setup lang="ts">
// The demo mode's start (Issue #49). Its click also lets the browser play the sound effects.
const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <section class="rpg-window demo-start" aria-label="デモ">
    <h2 class="rpg-window__title">デモ</h2>
    <p>架空のクエストで ギルドの ようすを くり返します。効果音が 鳴ります。</p>
    <p class="demo-start__actions">
      <button type="button" class="rpg-button demo-start__button" @click="emit('start')">
        ▶ はじめる
      </button>
    </p>
  </section>
</template>

<style scoped>
.demo-start__actions {
  margin: 0.6em 0 0;
  text-align: center;
}

.demo-start__button {
  font-size: 1.2em;
  padding: 0.3em 1.4em;
}
</style>
