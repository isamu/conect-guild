import type { z } from 'zod';

/** The subset of the Web Storage API this adapter uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Returns the storage to use. May throw (e.g. a SecurityError when storage is blocked). */
export type GetStorage = () => StorageLike;

export type StorageReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'missing' | 'unavailable' | 'parse' | 'invalid' };

export type StorageWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unavailable' | 'quota' | 'serialize' };

export type StorageRemoveResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'unavailable' };

/** A JSON key-value store over Web Storage. No method ever throws. */
export interface KeyValueStore {
  read<T>(key: string, schema: z.ZodType<T>): StorageReadResult<T>;
  write(key: string, value: unknown): StorageWriteResult;
  remove(key: string): StorageRemoveResult;
}

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && QUOTA_ERROR_NAMES.has(error.name);
}

function serialize(value: unknown): string | null {
  try {
    // Typed as string, but JSON.stringify returns undefined for undefined, functions and symbols.
    const text: unknown = JSON.stringify(value);
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function readRaw(getStorage: GetStorage, key: string): StorageReadResult<string> {
  try {
    const raw = getStorage().getItem(key);
    return raw === null ? { ok: false, reason: 'missing' } : { ok: true, value: raw };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function defaultGetStorage(): StorageLike {
  return globalThis.localStorage;
}

/** Creates a store over localStorage, or over the injected storage in tests. */
export function createKeyValueStore(getStorage: GetStorage = defaultGetStorage): KeyValueStore {
  return {
    read(key, schema) {
      const raw = readRaw(getStorage, key);
      if (!raw.ok) return raw;
      const json = parseJson(raw.value);
      if (!json.ok) return { ok: false, reason: 'parse' };
      const parsed = schema.safeParse(json.value);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'invalid' };
    },
    write(key, value) {
      const text = serialize(value);
      if (text === null) return { ok: false, reason: 'serialize' };
      try {
        getStorage().setItem(key, text);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' };
      }
    },
    remove(key) {
      try {
        getStorage().removeItem(key);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },
  };
}
