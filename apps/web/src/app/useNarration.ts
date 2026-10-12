import type { Snapshot } from '@conect-guild/snapshot';
import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { dayPhaseOf, hourFromQuery, hourOf } from '../render/daylight';
import { createIdleSeeds, idleActivities, type IdleSince } from '../render/idle';
import type { PartyRow } from './guildView';
import type { GuildMessage } from './messageQueue';
import { narrationPools, pickNarration, type NarrationPools } from './narration';
import { createNarrator, NARRATION_INTERVAL_MS, type Narration } from './narrator';
import { globalScheduler, type Scheduler } from './scheduler';
import type { Random } from '../render/confetti';

export interface NarrationSources {
  /** The head of the message queue: while there is one, it is shown instead of the narration. */
  readonly message: Readonly<Ref<GuildMessage | null>>;
  readonly party: Readonly<Ref<readonly PartyRow[]>>;
  readonly snapshot: () => Pick<Snapshot, 'issues' | 'prs'> | null;
  /** The ▼ button while an event message is shown. */
  readonly nextMessage: () => void;
}

const NOTHING: NarrationPools = { scene: [], time: [], record: [] };

/** Dev only: `?hour=21.5` fixes the time of day, as on the canvas (render/daylight.ts). */
function fixedHour(): number | null {
  return import.meta.env.DEV ? hourFromQuery(globalThis.location.search) : null;
}

export interface NarrationClock {
  readonly scheduler: Scheduler;
  readonly random: Random;
  /** Epoch ms. */
  readonly now: () => number;
  /** The local time of day, 0 to 24. */
  readonly hour: (now: number) => number;
}

const BROWSER_CLOCK: NarrationClock = {
  scheduler: globalScheduler,
  random: Math.random,
  now: Date.now,
  hour: (now) => fixedHour() ?? hourOf(new Date(now)),
};

/**
 * The narration bound to the screen, without the component's lifetime (useNarration adds it):
 * call start() once mounted and stop() when unmounted. Watchers follow the current effect scope.
 */
export function bindNarration(sources: NarrationSources, clock: NarrationClock = BROWSER_CLOCK) {
  const narration = shallowRef<Narration | null>(null);
  // The canvas's idle spells: the same salts, and the idle times it reports (GuildCanvas), so the
  // narration tells the outings the canvas shows. Empty until it reports: everybody is awake.
  const idleSeeds = createIdleSeeds(clock.random);
  let idleSince: IdleSince = {};

  function pools(): NarrationPools {
    const snapshot = sources.snapshot();
    if (snapshot === null) return NOTHING;
    const now = clock.now();
    return narrationPools({
      party: sources.party.value,
      activities: idleActivities(idleSince, idleSeeds, now),
      phase: dayPhaseOf(clock.hour(now)),
      snapshot,
      now,
    });
  }

  const narrator = createNarrator({
    scheduler: clock.scheduler,
    intervalMs: NARRATION_INTERVAL_MS,
    compose: (previous) => pickNarration(pools(), previous, clock.random),
    publish: (next) => {
      narration.value = next;
    },
  });

  // The first snapshot: tell something at once instead of after a whole interval.
  watch(sources.party, () => {
    narrator.wake();
  });
  // The event messages are over: back to the narration with a fresh line.
  watch(
    () => sources.message.value === null,
    (empty) => {
      if (empty) narrator.next();
    },
  );

  return {
    narration,
    idleSeeds,
    setIdleSince: (since: IdleSince) => {
      idleSince = since;
    },
    /** The ▼ button: the next event message while there is one, else the next narration. */
    next: () => {
      if (sources.message.value === null) narrator.next();
      else sources.nextMessage();
    },
    start: () => {
      narrator.next();
    },
    stop: () => {
      narrator.stop();
    },
  };
}

/**
 * The message window's narration while no event message is shown (Issue #30): a new line every
 * NARRATION_INTERVAL_MS, at once when the event messages are over, and on ▼. It never rings: the
 * sound effects follow the message queue only (useSound).
 */
export function useNarration(sources: NarrationSources) {
  const { start, stop, ...binding } = bindNarration(sources);
  onMounted(start);
  onBeforeUnmount(stop);
  return binding;
}
