import type { KeyValueStore } from '../adapters/storage';
import type { GuildEvent } from '../domain/events';
import { mayPlay, messageCue, newlyAwaiting, summonsCue, type PartyMember } from './judge';
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
  /**
   * What the screen shows now, handed over whole on every change so that a fetch that changes
   * several parts at once is judged in one fixed order: the halt, the party, the message, then the
   * king's summons.
   */
  screenChanged(screen: SoundScreen): void;
  setHidden(hidden: boolean): void;
}

export interface SoundScreen {
  readonly halted: boolean;
  /** The party rows (empty before the first snapshot); a newly waiting member rings once. */
  readonly party: readonly PartyMember[];
  /** The head of the message queue; it rings once, when a new id reaches the window. */
  readonly message: { readonly id: number; readonly event: GuildEvent | null } | null;
  /**
   * The president's latest order (Issue #28); a new id rings the king's call once, unless another
   * sound starts with it (two sounds never start together).
   */
  readonly summons: { readonly id: number } | null;
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
  let lastMessageId: number | null = null;
  let lastSummonsId: number | null = null;

  function play(cue: SoundCue): void {
    if (!mayPlay({ enabled: settings.enabled, hidden, halted })) return;
    player.play(SCORES[cue], VOLUME_GAIN[settings.volume]);
  }

  function update(next: SoundSettings): void {
    settings = next;
    saveSoundSettings(storage, settings);
  }

  /** The permission cue when someone newly waits for a permission; null otherwise. */
  function partyChanged(rows: readonly PartyMember[]): SoundCue | null {
    // No rows before the first snapshot: the first real party is the starting point.
    if (rows.length === 0) return null;
    const fresh = newlyAwaiting(previousParty, rows);
    previousParty = rows;
    // One alert however many start waiting together.
    return fresh.length > 0 ? 'permission' : null;
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
    screenChanged(screen) {
      // The party kept from before a halt is stale: the first one after it (of this same fetch)
      // is only the new starting point, so waits that began meanwhile do not ring.
      if (halted && !screen.halted) previousParty = null;
      halted = screen.halted;
      const permission = partyChanged(screen.party);
      const message = messageCue(screen.message, lastMessageId);
      const summons = summonsCue(screen.summons, lastSummonsId, permission ?? message);
      lastMessageId = screen.message?.id ?? null;
      lastSummonsId = screen.summons?.id ?? null;
      for (const cue of [permission, message, summons]) if (cue !== null) play(cue);
    },
    setHidden(next) {
      hidden = next;
    },
  };
}
