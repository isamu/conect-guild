import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { loadArt, PICTURE_TIMEOUT_MS } from './loadArt';
import { SPRITE_SIZE } from './metrics';

/**
 * The pictures come through fetch (revalidated) and createImageBitmap, both faked here. Art loaded
 * again in a page that stays open across a sprite change must get the sheet the server has now: an
 * <img> of the same URL came from the page's image cache, so a 7-frame sheet stayed 4 frames wide
 * and members raised items without lifting their hands.
 */

const IDS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'];

const bitmap = (width: number): ImageBitmap => ({
  width,
  height: SPRITE_SIZE,
  close: () => undefined,
});

function stubPictures(response: () => Promise<Response>, width = 7 * SPRITE_SIZE) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(response);
  const createImageBitmap = vi.fn<(blob: Blob) => Promise<ImageBitmap>>(() =>
    Promise.resolve(bitmap(width)),
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return { fetch, createImageBitmap };
}

const ok = () => Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadArt', () => {
  it('fetches every picture revalidated, so a changed sheet is not taken from a cache', async () => {
    const { fetch, createImageBitmap } = stubPictures(ok);
    await loadArt();
    // 6 members, the tiles, the small things and the held items.
    expect(fetch).toHaveBeenCalledTimes(9);
    for (const [, init] of fetch.mock.calls) {
      expect(init?.cache).toBe('no-cache');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(createImageBitmap).toHaveBeenCalledTimes(9);
  });

  it('gives the holding frames when the sheets the server sends now are 7 frames wide', async () => {
    stubPictures(ok);
    const art = await loadArt();
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(true);
  });

  it('falls back to the standing frames for 4-frame sheets', async () => {
    stubPictures(ok, 4 * SPRITE_SIZE);
    const art = await loadArt();
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
  });

  it('uses the placeholders, without decoding, when the server answers with an error', async () => {
    const { createImageBitmap } = stubPictures(() =>
      Promise.resolve(new Response('missing', { status: 404 })),
    );
    const art = await loadArt();
    expect(createImageBitmap).not.toHaveBeenCalled();
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
  });

  it('uses the placeholders when the pictures cannot be reached', async () => {
    const { createImageBitmap } = stubPictures(() => Promise.reject(new TypeError('offline')));
    const art = await loadArt();
    expect(createImageBitmap).not.toHaveBeenCalled();
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
  });
});

describe('loadArt with a picture that never arrives', () => {
  it('gives up on a picture that does not arrive in time and uses the placeholders', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const createImageBitmap = vi.fn<(blob: Blob) => Promise<ImageBitmap>>();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    let done = false;
    const loading = loadArt().finally(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(PICTURE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    const art = await loading;
    expect(createImageBitmap).not.toHaveBeenCalled();
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
  });
});

/** Bitmaps handed out by a fake createImageBitmap, with their close() recorded. */
function trackedBitmaps() {
  const closed = vi.fn<(width: number) => void>();
  const make = (width = 7 * SPRITE_SIZE): ImageBitmap => ({
    width,
    height: SPRITE_SIZE,
    close: () => {
      closed(width);
    },
  });
  return { closed, make };
}

describe('loadArt with a picture whose decoding never ends', () => {
  it('gives up at the same deadline and closes a bitmap that is finished too late', async () => {
    vi.useFakeTimers();
    const { closed, make } = trackedBitmaps();
    const late: (() => void)[] = [];
    vi.stubGlobal('fetch', vi.fn<(url: string) => Promise<Response>>(ok));
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn<(blob: Blob) => Promise<ImageBitmap>>(
        () =>
          new Promise((resolve) => {
            late.push(() => {
              resolve(make());
            });
          }),
      ),
    );
    let done = false;
    const loading = loadArt().finally(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(PICTURE_TIMEOUT_MS);
    expect(done).toBe(true);
    const art = await loading;
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
    // Decoding finishes after the deadline: nobody uses those bitmaps, so they are closed.
    for (const finish of late) finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toHaveBeenCalledTimes(9);
  });
});

describe('loadArt with one member sheet missing', () => {
  it('waits for the other sheets, closes them and draws every member as a placeholder', async () => {
    const { closed, make } = trackedBitmaps();
    let finishYukihiro = (): void => undefined;
    // Each body carries its URL, so the fake decoder knows which picture it has.
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string) => Promise<Response>>((url) =>
        Promise.resolve(
          url.includes('hibiki') ? new Response('missing', { status: 404 }) : new Response(url),
        ),
      ),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn<(blob: Blob) => Promise<ImageBitmap>>(async (blob) => {
        if (!(await blob.text()).includes('yukihiro')) return make();
        // ゆきひろ's sheet is decoded only after ひびき's has failed.
        return new Promise((resolve) => {
          finishYukihiro = () => {
            resolve(make());
          };
        });
      }),
    );
    let done = false;
    const loading = loadArt().finally(() => {
      done = true;
    });
    // Long enough for every fetch and the other decodes to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);
    finishYukihiro();
    const art = await loading;
    for (const id of IDS) expect(art.sprites.hasHoldFrames(id)).toBe(false);
    // The five sheets that did arrive are closed; tiles, small things and held items are kept.
    expect(closed).toHaveBeenCalledTimes(5);
  });
});
