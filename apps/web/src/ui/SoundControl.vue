<script setup lang="ts">
import { computed } from 'vue';
import { VOLUME_LEVELS, type SoundSettings } from '../audio/settings';

const props = defineProps<{ settings: SoundSettings }>();

const emit = defineEmits<{ toggle: []; 'cycle-volume': [] }>();

/** ■ for each level reached, □ for the rest. */
const meter = computed(() =>
  VOLUME_LEVELS.map((level) => (level <= props.settings.volume ? '■' : '□')).join(''),
);
</script>

<template>
  <span class="sound">
    <button
      type="button"
      class="rpg-button"
      :aria-pressed="settings.enabled"
      title="効果音（この端末にだけ保存します）"
      @click="emit('toggle')"
    >
      {{ settings.enabled ? '♪ 音を消す' : '♪ 音を出す' }}
    </button>
    <button
      type="button"
      class="rpg-button sound__volume"
      :aria-label="`音量 ${settings.volume}（押すと切り替え）`"
      title="音量を 3 段階で切り替えます"
      @click="emit('cycle-volume')"
    >
      音量 {{ meter }}
    </button>
  </span>
</template>

<style scoped>
.sound {
  display: inline-flex;
  gap: 0.4em;
}

.sound__volume {
  letter-spacing: -0.05em;
}
</style>
