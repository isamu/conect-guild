import { describe, expect, it } from 'vitest';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import {
  DEFAULT_SOUND_SETTINGS,
  loadSoundSettings,
  nextVolume,
  saveSoundSettings,
  SOUND_STORAGE_KEY,
  VOLUME_GAIN,
} from './settings';

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWith: Error | null = null;

  getItem(key: string): string | null {
    if (this.failWith !== null) throw this.failWith;
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWith !== null) throw this.failWith;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function setup() {
  const storage = new FakeStorage();
  return { storage, store: createKeyValueStore(() => storage) };
}

describe('nextVolume', () => {
  it('cycles 1 → 2 → 3 → 1', () => {
    expect(nextVolume(1)).toBe(2);
    expect(nextVolume(2)).toBe(3);
    expect(nextVolume(3)).toBe(1);
  });
});

describe('VOLUME_GAIN', () => {
  it('rises with the level and stays low for square waves', () => {
    expect(VOLUME_GAIN[1]).toBeLessThan(VOLUME_GAIN[2]);
    expect(VOLUME_GAIN[2]).toBeLessThan(VOLUME_GAIN[3]);
    expect(VOLUME_GAIN[1]).toBeGreaterThan(0);
    expect(VOLUME_GAIN[3]).toBeLessThanOrEqual(0.2);
  });
});

describe('loadSoundSettings / saveSoundSettings', () => {
  it('starts muted at the middle volume', () => {
    const { store } = setup();
    expect(loadSoundSettings(store)).toEqual({ enabled: false, volume: 2 });
    expect(DEFAULT_SOUND_SETTINGS.enabled).toBe(false);
  });

  it('round-trips the settings, storing only on/off and the volume', () => {
    const { storage, store } = setup();
    expect(saveSoundSettings(store, { enabled: true, volume: 3 })).toBe(true);
    expect(JSON.parse(storage.items.get(SOUND_STORAGE_KEY) ?? 'null')).toEqual({
      enabled: true,
      volume: 3,
    });
    expect(loadSoundSettings(store)).toEqual({ enabled: true, volume: 3 });
  });

  it.each([
    '{',
    '"on"',
    '{"enabled":true}',
    '{"enabled":"yes","volume":2}',
    '{"enabled":true,"volume":4}',
    '{"enabled":true,"volume":0}',
    '{"enabled":true,"volume":2,"title":"x"}',
  ])('falls back to the defaults for %s', (raw) => {
    const { storage, store } = setup();
    storage.items.set(SOUND_STORAGE_KEY, raw);
    expect(loadSoundSettings(store)).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('falls back to the defaults when storage throws, and reports a failed save', () => {
    const { storage, store } = setup();
    storage.failWith = new Error('blocked');
    expect(loadSoundSettings(store)).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(saveSoundSettings(store, { enabled: true, volume: 1 })).toBe(false);
    expect(storage.items.size).toBe(0);
  });
});
