import hibikiUrl from '../../../../assets/sprites/hibiki.png';
import hirameUrl from '../../../../assets/sprites/hirame.png';
import kanameUrl from '../../../../assets/sprites/kaname.png';
import minoriUrl from '../../../../assets/sprites/minori.png';
import sasaeUrl from '../../../../assets/sprites/sasae.png';
import yukihiroUrl from '../../../../assets/sprites/yukihiro.png';
import decorUrl from '../../../../assets/decor/decor.png';
import propsUrl from '../../../../assets/props/props.png';
import tilesetUrl from '../../../../assets/tiles/tileset.png';
import type { MemberId } from '../guild.config';
import {
  drawPlaceholderProp,
  placeholderArt,
  type DecorArt,
  type GuildArt,
  type SpriteArt,
  type TileArt,
} from './art';
import { chooseProps, createDecorArt, decorProps, sheetProps } from './decorArt';
import { createSpriteArt } from './spriteArt';
import { createTileArt } from './tileArt';

/**
 * Loads the pictures (bundled by Vite from assets/, never from another origin) and builds the art.
 * When a picture cannot be loaded, its part (tiles, members or the small things) falls back to the
 * placeholder boxes, so the stage still shows. Held items use their own pictures (props.png), then
 * the small things' pictures, then the placeholder boxes.
 */

const SPRITE_URLS: Readonly<Record<MemberId, string>> = {
  kaname: kanameUrl,
  minori: minoriUrl,
  hibiki: hibikiUrl,
  hirame: hirameUrl,
  sasae: sasaeUrl,
  yukihiro: yukihiroUrl,
};

/** How long one picture may take to arrive and be decoded (as adapters/snapshot.ts). */
export const PICTURE_TIMEOUT_MS = 10_000;

async function fetchPicture(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { cache: 'no-cache', signal });
  if (!response.ok) throw new Error(`picture: HTTP ${String(response.status)}`);
  return createImageBitmap(await response.blob());
}

/**
 * Fetched and revalidated, not through an <img>: in development the URLs carry no content hash, so
 * when the art is loaded again in the same page (a component remounted by HMR) an <img> of the same
 * URL comes from the page's image cache, and a 4-frame sheet stayed after the 7-frame one replaced
 * it (hands.hasHoldFrames: items raised without lifting the hands). A picture that has not arrived
 * and been decoded within PICTURE_TIMEOUT_MS is given up (its part falls back to the placeholders);
 * the fetch is aborted, and a bitmap decoded after that is closed.
 */
async function loadImage(url: string): Promise<ImageBitmap> {
  const controller = new AbortController();
  const work = fetchPicture(url, controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('picture: timeout'));
    }, PICTURE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    work.then(
      (late) => {
        late.close();
      },
      () => undefined,
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadTiles(): Promise<TileArt> {
  try {
    return createTileArt(await loadImage(tilesetUrl));
  } catch {
    return placeholderArt.tiles;
  }
}

async function loadSprites(): Promise<SpriteArt> {
  const load = (id: MemberId) => loadImage(SPRITE_URLS[id]);
  try {
    const [kaname, minori, hibiki, hirame, sasae, yukihiro] = await Promise.all([
      load('kaname'),
      load('minori'),
      load('hibiki'),
      load('hirame'),
      load('sasae'),
      load('yukihiro'),
    ]);
    const sheets = { kaname, minori, hibiki, hirame, sasae, yukihiro };
    return createSpriteArt(sheets, drawPlaceholderProp);
  } catch {
    return placeholderArt.sprites;
  }
}

async function loadDecor(): Promise<DecorArt | null> {
  try {
    return createDecorArt(await loadImage(decorUrl));
  } catch {
    return null;
  }
}

async function loadProps(): Promise<SpriteArt['drawProp'] | null> {
  try {
    return sheetProps(await loadImage(propsUrl));
  } catch {
    return null;
  }
}

export async function loadArt(): Promise<GuildArt> {
  const [tiles, sprites, decor, props] = await Promise.all([
    loadTiles(),
    loadSprites(),
    loadDecor(),
    loadProps(),
  ]);
  return {
    tiles,
    sprites: {
      ...sprites,
      drawProp: chooseProps(props, decor === null ? null : decorProps(decor)),
    },
    decor: decor ?? placeholderArt.decor,
  };
}
