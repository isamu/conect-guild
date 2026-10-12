import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { loadArt } from './loadArt';
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
  vi.unstubAllGlobals();
});

describe('loadArt', () => {
  it('fetches every picture revalidated, so a changed sheet is not taken from a cache', async () => {
    const { fetch, createImageBitmap } = stubPictures(ok);
    await loadArt();
    // 6 members, the tiles, the small things and the held items.
    expect(fetch).toHaveBeenCalledTimes(9);
    for (const [, init] of fetch.mock.calls) expect(init).toEqual({ cache: 'no-cache' });
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
