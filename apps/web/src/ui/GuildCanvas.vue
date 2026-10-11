<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import type { PartyRow, SceneCue } from '../app/guildView';
import { ambientMoodsOf } from '../render/ambient';
import type { GuildArt } from '../render/art';
import { bubblesOf } from '../render/bubbles';
import { loadArt } from '../render/loadArt';
import { startRenderLoop, type RenderLoop } from '../render/loop';

const props = defineProps<{
  /** Party rows; members who wait on someone get a bubble over their seat. */
  party: readonly PartyRow[];
  /** The event of the message now in the window; its scene starts when it changes. */
  cue: SceneCue | null;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
let loop: RenderLoop | null = null;
let observer: ResizeObserver | null = null;
let unmounted = false;

function start(element: HTMLCanvasElement, art: GuildArt): void {
  const running = startRenderLoop({ canvas: element, art });
  loop = running;
  running.setBubbles(bubblesOf(props.party));
  running.setMoods(ambientMoodsOf(props.party));
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? element.clientWidth;
    running.resize(width, globalThis.devicePixelRatio);
  });
  observer.observe(element);
}

onMounted(() => {
  // The loop starts once the pictures are in, so the cached background has them.
  void loadArt().then((art) => {
    const element = canvas.value;
    if (unmounted || element === null) return;
    start(element, art);
  });
});

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  loop?.stop();
  loop = null;
});

watch(
  () => props.party,
  (rows) => {
    loop?.setBubbles(bubblesOf(rows));
    loop?.setMoods(ambientMoodsOf(rows));
  },
);

watch(
  () => props.cue?.id,
  () => {
    if (props.cue !== null) loop?.play(props.cue.event);
  },
);
</script>

<template>
  <canvas ref="canvas" class="guild-canvas" aria-label="ギルドの社屋" role="img" />
</template>

<style scoped>
.guild-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  image-rendering: pixelated;
  user-select: none;
}
</style>
