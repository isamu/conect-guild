<script setup lang="ts">
import type { BoardGroup } from '../app/guildView';

defineProps<{
  groups: readonly BoardGroup[];
  /** False until the first snapshot arrives. */
  loaded: boolean;
}>();
</script>

<template>
  <section class="rpg-window board" aria-label="クエスト掲示板">
    <h2 class="rpg-window__title board__title">クエスト掲示板</h2>
    <p v-if="!loaded" class="board__empty">よみこみちゅう…</p>
    <p v-else-if="groups.length === 0" class="board__empty">いまは クエストが ありません</p>
    <div class="board__list">
      <div v-for="group in groups" :key="group.key" class="board__group">
        <h3 class="board__group-label">
          <span class="board__dot" :style="{ background: group.color }" />{{ group.label }}
        </h3>
        <ul class="board__scrolls">
          <li v-for="quest in group.quests" :key="quest.number" class="scroll">
            <span class="scroll__number">#{{ quest.number }}</span>
            <span class="scroll__title">{{ quest.title }}</span>
            <span
              v-if="quest.multiDepartment"
              class="scroll__multi"
              title="部門ラベルが複数あります。最初の部門が担当します"
              >複数部門</span
            >
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
}

.board__title {
  background: linear-gradient(180deg, #1d3aa8, #0f2273);
  border: 0.12em solid #e8c66a;
  border-radius: 0.3em;
  padding: 0.15em 0;
}

.board__empty {
  margin: 0.6em 0;
  text-align: center;
  color: var(--muted-text);
}

.board__list {
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
}

.board__group + .board__group {
  margin-top: 0.3em;
}

.board__group-label {
  margin: 0.1em 0 0.15em;
  font-size: 0.8em;
  font-weight: 700;
  color: var(--muted-text);
}

.board__dot {
  display: inline-block;
  width: 0.6em;
  height: 0.6em;
  margin-right: 0.35em;
  border-radius: 50%;
  border: 0.08em solid #fff;
}

.board__scrolls {
  margin: 0;
  padding: 0;
  list-style: none;
}

.scroll {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  margin: 0 0.5em 0.25em;
  padding: 0.2em 0.9em;
  background: var(--scroll-paper);
  color: var(--scroll-ink);
  border-top: 0.1em solid var(--scroll-edge);
  border-bottom: 0.1em solid var(--scroll-edge);
  font-weight: 700;
}

/* Rolled ends of the scroll. */
.scroll::before,
.scroll::after {
  content: '';
  position: absolute;
  top: -0.15em;
  bottom: -0.15em;
  width: 0.55em;
  border-radius: 0.3em;
  background: linear-gradient(90deg, #a77b35, #f1d79a 50%, #a77b35);
}

.scroll::before {
  left: -0.4em;
}

.scroll::after {
  right: -0.4em;
}

.scroll__number {
  flex: none;
}

.scroll__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scroll__multi {
  flex: none;
  font-size: 0.7em;
  padding: 0 0.35em;
  border-radius: 0.25em;
  background: #8e2b2b;
  color: #fff;
}
</style>
