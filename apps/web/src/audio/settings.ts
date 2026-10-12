import { z } from 'zod';
import type { KeyValueStore } from '../adapters/storage';

/** localStorage key of the sound settings (on/off and volume only). */
export const SOUND_STORAGE_KEY = 'conect-guild:sound';

export const VOLUME_LEVELS = [1, 2, 3] as const;

const settingsSchema = z.strictObject({
  enabled: z.boolean(),
  volume: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type SoundSettings = z.infer<typeof settingsSchema>;
export type VolumeLevel = SoundSettings['volume'];

/** Muted at first: the browser cannot play before the viewer acts anyway. */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: false, volume: 2 };

/** Oscillator gain per level. Square waves are loud, so even the top level stays low. */
export const VOLUME_GAIN: Readonly<Record<VolumeLevel, number>> = { 1: 0.03, 2: 0.07, 3: 0.14 };

/** The volume button cycles 1 → 2 → 3 → 1. */
export function nextVolume(level: VolumeLevel): VolumeLevel {
  return VOLUME_LEVELS[level % VOLUME_LEVELS.length] ?? 1;
}

/** The stored settings, or the defaults when they are missing, broken or unreadable. */
export function loadSoundSettings(storage: KeyValueStore): SoundSettings {
  const stored = storage.read(SOUND_STORAGE_KEY, settingsSchema);
  return stored.ok ? stored.value : DEFAULT_SOUND_SETTINGS;
}

/** Saves the settings; a failure only means they are not kept for the next visit. */
export function saveSoundSettings(storage: KeyValueStore, settings: SoundSettings): boolean {
  return storage.write(SOUND_STORAGE_KEY, settings).ok;
}
