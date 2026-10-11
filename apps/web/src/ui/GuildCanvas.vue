<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import {
  EMPTY_CUE_QUEUE,
  receiveCue,
  takeCues,
  type PartyRow,
  type SceneCue,
} from '../app/guildView';
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
/** Cues seen so far; those that arrive while the pictures load wait for the loop. */
let cues = EMPTY_CUE_QUEUE;

/** Starts the queued scenes in order, once the loop runs. */
function playCues(): void {
  if (loop === null) return;
  const taken = takeCues(cues);
  cues = taken.queue;
  for (const cue of taken.play) loop.play(cue.event);
}

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
  // Messages may have reached the window while the pictures were loading.
  playCues();
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
    cues = receiveCue(cues, props.cue);
    playCues();
  },
  // The message in the window at mount counts too.
  { immediate: true },
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
