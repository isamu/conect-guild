import { describe, expect, it } from 'vitest';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import { createSoundController, type SoundScreen } from './controller';
import type { PartyMember } from './judge';
import type { TonePlayer } from './player';
import { SCORES, type Score, type SoundCue } from './scores';
import { SOUND_STORAGE_KEY, VOLUME_GAIN } from './settings';

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('blocked');
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const CUES: readonly SoundCue[] = ['scroll', 'chest', 'clear', 'permission', 'summon', 'text'];

/** Records what would ring, by cue name. */
class FakePlayer implements TonePlayer {
  readonly played: { cue: SoundCue | 'unknown'; volume: number }[] = [];
  unlocks = 0;

  unlock(): Promise<void> {
    this.unlocks += 1;
    return Promise.resolve();
  }

  play(score: Score, volume: number): boolean {
    const cue = CUES.find((key) => SCORES[key] === score);
    this.played.push({ cue: cue ?? 'unknown', volume });
    return true;
  }
}

const cues = (player: FakePlayer) => player.played.map((entry) => entry.cue);

const event = (kind: GuildEventKind): GuildEvent => ({
  id: `${kind}#1`,
  kind,
  number: 1,
  department: null,
});

const party = (...awaiting: PartyMember['id'][]): PartyMember[] =>
  (['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const).map((id) => ({
    id,
    state: awaiting.includes(id) ? 'awaiting-permission' : 'idle',
  }));

/** Lets the blip after an unlock (a resolved promise) run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(stored?: { enabled: boolean; volume: 1 | 2 | 3 }) {
  const storage = new FakeStorage();
  if (stored !== undefined) storage.items.set(SOUND_STORAGE_KEY, JSON.stringify(stored));
  const player = new FakePlayer();
  const controller = createSoundController({ player, storage: createKeyValueStore(() => storage) });
  let screen: SoundScreen = {
    halted: false,
    party: [],
    message: null,
    summons: null,
    stageShown: true,
  };
  let nextId = 1;
  /** Hands over the screen with `patch` applied, as the one watcher in app/useSound.ts does. */
  const show = (patch: Partial<SoundScreen>) => {
    screen = { ...screen, ...patch };
    controller.screenChanged(screen);
  };
  /** A new message (a new id) with the event of `kind`, or a notice for null. */
  const message = (kind: GuildEventKind | null) => ({
    id: nextId++,
    event: kind === null ? null : event(kind),
  });
  return { storage, player, controller, show, message };
}

describe('createSoundController: settings', () => {
  it('starts muted and plays nothing', () => {
    const { player, controller, show, message } = setup();
    expect(controller.settings()).toEqual({ enabled: false, volume: 2 });
    show({ message: message('pr-merged') });
    expect(player.played).toEqual([]);
  });

  it('turning on unlocks, saves and blips once at the current volume', async () => {
    const { storage, player, controller } = setup();
    controller.toggle();
    await settle();
    expect(controller.settings().enabled).toBe(true);
    expect(player.unlocks).toBe(1);
    expect(player.played).toEqual([{ cue: 'text', volume: VOLUME_GAIN[2] }]);
    expect(JSON.parse(storage.items.get(SOUND_STORAGE_KEY) ?? 'null')).toEqual({
      enabled: true,
      volume: 2,
    });
  });

  it('turning off saves and stays silent', async () => {
    const { storage, player, controller } = setup({ enabled: true, volume: 1 });
    controller.toggle();
    await settle();
    expect(controller.settings().enabled).toBe(false);
    expect(player.played).toEqual([]);
    expect(storage.items.get(SOUND_STORAGE_KEY)).toBe('{"enabled":false,"volume":1}');
  });

  it('cycles the volume, blipping at the new level only while on', async () => {
    const muted = setup();
    muted.controller.cycleVolume();
    await settle();
    expect(muted.controller.settings().volume).toBe(3);
    expect(muted.player.played).toEqual([]);

    const on = setup({ enabled: true, volume: 3 });
    on.controller.cycleVolume();
    await settle();
    expect(on.controller.settings().volume).toBe(1);
    expect(on.player.played).toEqual([{ cue: 'text', volume: VOLUME_GAIN[1] }]);
  });

  it('keeps working in memory when the settings cannot be saved', async () => {
    const { storage, player, controller } = setup();
    storage.failWrites = true;
    controller.toggle();
    await settle();
    expect(controller.settings().enabled).toBe(true);
    expect(cues(player)).toEqual(['text']);
  });

  it('unlock() resumes the audio only when the sound is on', () => {
    const muted = setup();
    muted.controller.unlock();
    expect(muted.player.unlocks).toBe(0);
    const on = setup({ enabled: true, volume: 2 });
    on.controller.unlock();
    expect(on.player.unlocks).toBe(1);
  });
});

describe('createSoundController: messages', () => {
  it('plays each event kind its own sound, and the blips for a notice', () => {
    const { player, show, message } = setup({ enabled: true, volume: 3 });
    show({ message: message('issue-opened') });
    show({ message: message('pr-merged') });
    show({ message: message('issue-closed') });
    show({ message: message(null) });
    expect(cues(player)).toEqual(['scroll', 'chest', 'clear', 'text']);
    expect(player.played.every((entry) => entry.volume === VOLUME_GAIN[3])).toBe(true);
  });

  it('plays a message once, however often the rest of the screen changes', () => {
    const { player, show, message } = setup({ enabled: true, volume: 2 });
    show({ message: message('pr-merged') });
    show({ party: party() });
    show({ party: party() });
    show({ message: null });
    expect(cues(player)).toEqual(['chest']);
  });

  it('stays silent while the page is hidden, and does not catch up when shown', () => {
    const { player, controller, show, message } = setup({ enabled: true, volume: 2 });
    controller.setHidden(true);
    show({ message: message('pr-merged') });
    controller.setHidden(false);
    show({ party: party() });
    expect(player.played).toEqual([]);
    show({ message: message('issue-closed') });
    expect(cues(player)).toEqual(['clear']);
  });

  it('stays silent for a message that arrives with the halt (same fetch)', () => {
    const { player, show, message } = setup({ enabled: true, volume: 2 });
    show({ halted: true, message: message('issue-opened') });
    show({ party: party() });
    show({ party: party('minori') });
    expect(player.played).toEqual([]);
    show({ halted: false, message: message('issue-opened') });
    expect(cues(player)).toEqual(['scroll']);
  });
});

describe('createSoundController: permissions', () => {
  it('rings once when someone newly waits, not again while they keep waiting', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    show({ party: party('minori') });
    show({ party: party('minori') });
    expect(cues(player)).toEqual(['permission']);
  });

  it('rings once for several who start together, and again for a later one', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    show({ party: party('minori', 'hibiki') });
    show({ party: party('minori', 'hibiki', 'kaname') });
    expect(cues(player)).toEqual(['permission', 'permission']);
  });

  it('takes the party of the fetch that ends a halt as the starting point, without ringing', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    show({ halted: true });
    // The same fetch lifts the halt and brings a party with waits that began meanwhile.
    show({ halted: false, party: party('minori') });
    expect(player.played).toEqual([]);
    // The next fetch's new wait rings: the recovery party stays the starting point.
    show({ party: party('minori', 'hibiki') });
    expect(cues(player)).toEqual(['permission']);
  });

  it('does not ring for those already waiting on the first snapshot', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ party: [] });
    show({ party: party('minori') });
    expect(player.played).toEqual([]);
  });

  it('does not ring later for a wait that began while hidden or muted', () => {
    const { player, controller, show } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    controller.setHidden(true);
    show({ party: party('minori') });
    controller.setHidden(false);
    show({ party: party('minori') });
    expect(player.played).toEqual([]);

    const muted = setup();
    muted.show({ party: party() });
    muted.show({ party: party('minori') });
    muted.controller.toggle();
    muted.show({ party: party('minori') });
    expect(cues(muted.player).filter((cue) => cue === 'permission')).toEqual([]);
  });
});

describe("createSoundController: the king's summons", () => {
  it('rings once per order, not again while the same one stays', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    show({ summons: { id: 1 } });
    show({ party: party() });
    show({ summons: { id: 1 } });
    show({ summons: { id: 2 } });
    expect(cues(player)).toEqual(['summon', 'summon']);
  });

  it('is silent before the first order, while muted, hidden or halted, and does not catch up', () => {
    const { player, controller, show } = setup({ enabled: true, volume: 2 });
    show({ summons: null });
    controller.setHidden(true);
    show({ summons: { id: 1 } });
    controller.setHidden(false);
    show({ halted: true, summons: { id: 2 } });
    show({ halted: false });
    expect(player.played).toEqual([]);

    const muted = setup();
    muted.show({ summons: { id: 1 } });
    muted.controller.toggle();
    muted.show({ party: party() });
    expect(cues(muted.player).filter((cue) => cue === 'summon')).toEqual([]);
  });

  it('is silent for an order that comes while the canvas is hidden, and does not catch up', () => {
    const { player, show } = setup({ enabled: true, volume: 2 });
    show({ stageShown: false, summons: { id: 1 } });
    show({ stageShown: true });
    expect(player.played).toEqual([]);
    show({ summons: { id: 2 } });
    expect(cues(player)).toEqual(['summon']);
  });

  it('gives way to a message or a permission sound that starts with it', () => {
    const { player, show, message } = setup({ enabled: true, volume: 2 });
    show({ party: party() });
    show({ message: message('issue-opened'), summons: { id: 1 } });
    show({ party: party('minori'), summons: { id: 2 } });
    expect(cues(player)).toEqual(['scroll', 'permission']);
    show({ summons: { id: 3 } });
    expect(cues(player)).toEqual(['scroll', 'permission', 'summon']);
  });
});
