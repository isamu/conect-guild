import type { KeyValueStore } from '../adapters/storage';
import type { GuildEvent } from '../domain/events';
import { cueForMessage, mayPlay, newlyAwaiting, type PartyMember } from './judge';
import type { TonePlayer } from './player';
import { SCORES, type SoundCue } from './scores';
import {
  loadSoundSettings,
  nextVolume,
  saveSoundSettings,
  VOLUME_GAIN,
  type SoundSettings,
} from './settings';

/**
 * Decides when the sound effects ring (docs/DESIGN.md 6 章 M4). It hears what the screen does —
 * a message reaching the window, a new party, the page hidden, the screen halted — and plays
 * through the injected player. Nothing that is missed is played later.
 */
export interface SoundController {
  settings(): SoundSettings;
  /** The 音 button. Turning it on unlocks the audio (call from the click) and blips once. */
  toggle(): void;
  /** The 音量 button: 1 → 2 → 3 → 1, with a blip at the new level when the sound is on. */
  cycleVolume(): void;
  /** Any click or key press: lets a sound turned on in an earlier visit play again. */
  unlock(): void;
  /** A message reached the window (the same moment its scene starts). */
  messageShown(message: { readonly event: GuildEvent | null }): void;
  /**
   * The party rows of a new snapshot (empty before the first one); rings once when someone newly
   * waits for a permission.
   */
  partyChanged(rows: readonly PartyMember[]): void;
  setHidden(hidden: boolean): void;
  setHalted(halted: boolean): void;
}

export interface SoundControllerOptions {
  readonly player: TonePlayer;
  readonly storage: KeyValueStore;
}

export function createSoundController(options: SoundControllerOptions): SoundController {
  const { player, storage } = options;
  let settings = loadSoundSettings(storage);
  let hidden = false;
  let halted = false;
  let previousParty: readonly PartyMember[] | null = null;

  function play(cue: SoundCue): void {
    if (!mayPlay({ enabled: settings.enabled, hidden, halted })) return;
    player.play(SCORES[cue], VOLUME_GAIN[settings.volume]);
  }

  function update(next: SoundSettings): void {
    settings = next;
    saveSoundSettings(storage, settings);
  }

  /** The feedback blip of the buttons, once the audio is unlocked by the same click. */
  function blip(): void {
    void player.unlock().then(() => {
      play('text');
    });
  }

  return {
    settings: () => settings,
    toggle() {
      update({ ...settings, enabled: !settings.enabled });
      if (settings.enabled) blip();
    },
    cycleVolume() {
      update({ ...settings, volume: nextVolume(settings.volume) });
      if (settings.enabled) blip();
    },
    unlock() {
      if (settings.enabled) void player.unlock();
    },
    messageShown(message) {
      play(cueForMessage(message));
    },
    partyChanged(rows) {
      // No rows before the first snapshot: the first real party is the starting point.
      if (rows.length === 0) return;
      const fresh = newlyAwaiting(previousParty, rows);
      previousParty = rows;
      // One alert however many start waiting together.
      if (fresh.length > 0) play('permission');
    },
    setHidden(next) {
      hidden = next;
    },
    setHalted(next) {
      halted = next;
    },
  };
}
