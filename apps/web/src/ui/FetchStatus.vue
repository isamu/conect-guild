<script setup lang="ts">
import type { FetchStatusView } from '../app/guildView';

defineProps<{
  status: FetchStatusView;
  /** False when localStorage cannot be used (no events are shown). */
  effectsAvailable: boolean;
  /** Result of the last "基準を消す". */
  baselineNotice: string | null;
}>();

const emit = defineEmits<{ 'clear-baseline': [] }>();
</script>

<template>
  <section class="rpg-window fetch" aria-label="取得のようす">
    <p class="fetch__line">
      <span>最終取得 {{ status.fetchedAt ?? '--:--' }}</span>
      <span
        v-if="status.stale"
        class="fetch__badge fetch__badge--stale"
        title="5 分以上更新されていません。収集スクリプトが止まっているかもしれません"
        >情報が古い</span
      >
    </p>
    <p
      v-if="status.sessions !== null"
      class="fetch__line fetch__note"
      title="作業中・許可待ちは GitHub だけでは分からないため、いまは出していません"
    >
      {{ status.sessions }}
    </p>
    <p v-if="status.failure !== null" class="fetch__line fetch__failure" role="status">
      {{ status.failure }}
    </p>
    <p v-if="!effectsAvailable" class="fetch__line fetch__note">
      localStorage が使えないため、演出は出ません
    </p>
    <p class="fetch__line">
      <button
        type="button"
        class="rpg-button"
        title="この端末に保存した差分の基準（番号・状態・時刻）を消します"
        @click="emit('clear-baseline')"
      >
        基準を消す
      </button>
      <!-- Controls that sit on this line without making the window taller (the sound buttons). -->
      <slot />
      <span v-if="baselineNotice !== null" class="fetch__note">{{ baselineNotice }}</span>
    </p>
  </section>
</template>

<style scoped>
.fetch {
  font-size: 0.8em;
  padding: 0.35em 0.6em;
}

.fetch__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5em;
  margin: 0;
}

.fetch__line + .fetch__line {
  margin-top: 0.3em;
}

.fetch__badge {
  padding: 0 0.4em;
  border-radius: 0.25em;
  font-weight: 700;
}

.fetch__badge--stale {
  background: #b36b00;
  color: #fff;
}

.fetch__failure {
  color: var(--danger);
  font-weight: 700;
}

.fetch__note {
  color: var(--muted-text);
}
</style>
