import { shallowRef, type Ref } from 'vue';
import { createKeyValueStore, createMemoryStorage, type KeyValueStore } from '../adapters/storage';
import { SOUND_STORAGE_KEY, type SoundSettings } from '../audio/settings';
import { demoSnapshotAt } from '../domain/demo';
import type { GuildStoreOptions } from './guildStore';

/**
 * The demo mode for filming (Issue #49): `?demo=1` plays the fictional script (domain/demo.ts)
 * instead of reading /snapshot.json. Nothing of it reaches localStorage.
 */

/** True for `?demo=1` in the page's query (like `?hour=`). */
export function isDemoQuery(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1';
}

/** The demo is local and cheap to read, so it is read often: events follow the script closely. */
export const DEMO_REFRESH_INTERVAL_MS = 1_000;

/** The sound is on in the demo: the はじめる click lets the browser play it (app/useSound.ts). */
const DEMO_SOUND: SoundSettings = { enabled: true, volume: 2 };

export interface DemoSession {
  /** The store reads the script, keeps its baseline in memory and follows the script closely. */
  readonly guildOptions: GuildStoreOptions;
  /** In memory: the sound settings and the idle times of the demo stay in the page. */
  readonly storage: KeyValueStore;
  /** False until はじめる: the script waits at its start (an empty board). */
  readonly started: Readonly<Ref<boolean>>;
  /** はじめる: the script starts now. Only the first call counts. */
  start(): void;
}

export function createDemoSession(now: () => number = Date.now): DemoSession {
  const memory = createMemoryStorage();
  const storage = createKeyValueStore(() => memory);
  storage.write(SOUND_STORAGE_KEY, DEMO_SOUND);
  const started = shallowRef(false);
  let startedAt: number | null = null;
  return {
    guildOptions: {
      loadSnapshot: () => {
        const at = now();
        const snapshot = demoSnapshotAt(startedAt === null ? 0 : at - startedAt, at);
        return Promise.resolve({ ok: true, snapshot });
      },
      storage,
      now,
      refreshIntervalMs: DEMO_REFRESH_INTERVAL_MS,
    },
    storage,
    started,
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      started.value = true;
    },
  };
}
