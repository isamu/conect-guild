import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createKeyValueStore, type StorageLike } from './storage';

const schema = z.strictObject({ number: z.number(), state: z.enum(['open', 'closed']) });

/** An in-memory Storage fake whose operations can be made to fail. */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWith: Error | null = null;

  private check(): void {
    if (this.failWith !== null) throw this.failWith;
  }

  getItem(key: string): string | null {
    this.check();
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.check();
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.check();
    this.items.delete(key);
  }
}

function setup() {
  const storage = new FakeStorage();
  return { storage, store: createKeyValueStore(() => storage) };
}

describe('createKeyValueStore: read', () => {
  it('round-trips a valid value', () => {
    const { store } = setup();
    expect(store.write('k', { number: 1, state: 'open' })).toEqual({ ok: true });
    expect(store.read('k', schema)).toEqual({ ok: true, value: { number: 1, state: 'open' } });
  });

  it('reports a missing key', () => {
    const { store } = setup();
    expect(store.read('k', schema)).toEqual({ ok: false, reason: 'missing' });
  });

  it.each(['{', 'undefined', '', "{'a':1}"])('reports broken JSON %j as parse', (raw) => {
    const { storage, store } = setup();
    storage.items.set('k', raw);
    expect(store.read('k', schema)).toEqual({ ok: false, reason: 'parse' });
  });

  it.each([
    ['a wrong type', '{"number":"1","state":"open"}'],
    ['an extra key (e.g. a stored title)', '{"number":1,"state":"open","title":"x"}'],
    ['null', 'null'],
  ])('reports %s as invalid', (_label, raw) => {
    const { storage, store } = setup();
    storage.items.set('k', raw);
    expect(store.read('k', schema)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports a throwing storage as unavailable', () => {
    const { storage, store } = setup();
    storage.failWith = new DOMException('blocked', 'SecurityError');
    expect(store.read('k', schema)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a throwing storage getter as unavailable', () => {
    const store = createKeyValueStore(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(store.read('k', schema)).toEqual({ ok: false, reason: 'unavailable' });
    expect(store.write('k', 1)).toEqual({ ok: false, reason: 'unavailable' });
    expect(store.remove('k')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('createKeyValueStore: write and remove', () => {
  it.each(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])(
    'reports %s as quota and leaves the old value',
    (name) => {
      const { storage, store } = setup();
      storage.items.set('k', '{"number":1,"state":"open"}');
      storage.failWith = new DOMException('full', name);
      expect(store.write('k', { number: 2, state: 'closed' })).toEqual({
        ok: false,
        reason: 'quota',
      });
      expect(storage.items.get('k')).toBe('{"number":1,"state":"open"}');
    },
  );

  it('reports other write errors as unavailable', () => {
    const { storage, store } = setup();
    storage.failWith = new Error('boom');
    expect(store.write('k', 1)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['a bigint', 1n],
  ])('refuses to serialize %s and writes nothing', (_label, value) => {
    const { storage, store } = setup();
    expect(store.write('k', value)).toEqual({ ok: false, reason: 'serialize' });
    expect(storage.items.has('k')).toBe(false);
  });

  it('refuses a circular value', () => {
    const { store } = setup();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(store.write('k', circular)).toEqual({ ok: false, reason: 'serialize' });
  });

  it('removes a key', () => {
    const { storage, store } = setup();
    storage.items.set('k', '1');
    expect(store.remove('k')).toEqual({ ok: true });
    expect(storage.items.has('k')).toBe(false);
  });

  it('reports a throwing remove as unavailable', () => {
    const { storage, store } = setup();
    storage.failWith = new Error('boom');
    expect(store.remove('k')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not throw when no localStorage exists by default', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    try {
      const store = createKeyValueStore();
      expect(store.read('k', schema)).toEqual({ ok: false, reason: 'unavailable' });
      expect(store.write('k', 1)).toEqual({ ok: false, reason: 'unavailable' });
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
