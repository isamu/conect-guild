<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import {
  EMPTY_CUE_QUEUE,
  receiveCue,
  takeCues,
  type PartyRow,
  type SceneCue,
} from '../app/guildView';
import { createLastActiveTracker } from '../app/lastActive';
import { ambientMoodsOf } from '../render/ambient';
import type { GuildArt } from '../render/art';
import { bubblesOf } from '../render/bubbles';
import { hourFromQuery } from '../render/daylight';
import { loadArt } from '../render/loadArt';
import type { IdleSince } from '../render/idle';
import { isShown, startRenderLoop, type RenderLoop, type StageParty } from '../render/loop';

const props = defineProps<{
  /** Party rows; members who wait on someone get a bubble over their seat. */
  party: readonly PartyRow[];
  /** The event of the message now in the window; its scene starts when it changes. */
  cue: SceneCue | null;
}>();

/** Whether the canvas is on screen (narrow screens hide it); sent on every change. */
const emit = defineEmits<{ stageShown: [shown: boolean] }>();

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
let loop: RenderLoop | null = null;
let observer: ResizeObserver | null = null;
let unmounted = false;
/** The latest displayed width (CSS px); null until the first observation. */
let cssWidth: number | null = null;
/** Cues seen so far; those that arrive while the pictures load wait for the loop. */
let cues = EMPTY_CUE_QUEUE;
/** When each member last had work (localStorage), for dozing, sleeping and playing (Issue #23). */
const lastActive = createLastActiveTracker();
let idleSince: IdleSince = {};

function stageParty(rows: readonly PartyRow[]): StageParty {
  return { bubbles: bubblesOf(rows), moods: ambientMoodsOf(rows), idleSince };
}

/**
 * Starts the queued scenes in order, once the loop runs. While the canvas is out of sight they are
 * dropped, so they never play late (the message queue does not wait for them either).
 */
function playCues(): void {
  const hidden = cssWidth !== null && !isShown(cssWidth);
  if (loop === null && !hidden) return;
  const taken = takeCues(cues);
  cues = taken.queue;
  if (hidden) return;
  for (const cue of taken.play) loop?.play(cue.event);
}

/** Dev only: `?hour=21.5` fixes the time of day, to check the day and the night by hand. */
const fixedHour = import.meta.env.DEV ? hourFromQuery(globalThis.location.search) : null;

function start(element: HTMLCanvasElement, art: GuildArt): void {
  const running = startRenderLoop({
    canvas: element,
    art,
    ...(fixedHour === null ? {} : { localHour: () => fixedHour }),
    onActive: (ids, at) => {
      idleSince = lastActive.markActive(ids, at);
      loop?.setParty(stageParty(props.party));
    },
  });
  loop = running;
  idleSince = lastActive.observe(props.party, Date.now());
  running.setParty(stageParty(props.party));
  running.resize(cssWidth ?? element.clientWidth, globalThis.devicePixelRatio);
  // Messages may have reached the window while the pictures were loading.
  playCues();
}

/** Follows the displayed width, from mount on, so the message queue knows it before the art. */
function observe(element: HTMLCanvasElement): void {
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? element.clientWidth;
    if (cssWidth === null || isShown(width) !== isShown(cssWidth))
      emit('stageShown', isShown(width));
    cssWidth = width;
    loop?.resize(width, globalThis.devicePixelRatio);
    playCues();
  });
  observer.observe(element);
}

onMounted(() => {
  if (canvas.value !== null) observe(canvas.value);
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
    idleSince = lastActive.observe(rows, Date.now());
    loop?.setParty(stageParty(rows));
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
