import hibikiUrl from '../../../../assets/sprites/hibiki.png';
import hirameUrl from '../../../../assets/sprites/hirame.png';
import kanameUrl from '../../../../assets/sprites/kaname.png';
import minoriUrl from '../../../../assets/sprites/minori.png';
import sasaeUrl from '../../../../assets/sprites/sasae.png';
import yukihiroUrl from '../../../../assets/sprites/yukihiro.png';
import decorUrl from '../../../../assets/decor/decor.png';
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
import { createDecorArt, decorProps } from './decorArt';
import { createSpriteArt } from './spriteArt';
import { createTileArt } from './tileArt';

/**
 * Loads the pictures (bundled by Vite from assets/, never from another origin) and builds the art.
 * When a picture cannot be loaded, its part (tiles, members or the small things) falls back to the
 * placeholder boxes, so the stage still shows. Held items use the small things' pictures.
 */

const SPRITE_URLS: Readonly<Record<MemberId, string>> = {
  kaname: kanameUrl,
  minori: minoriUrl,
  hibiki: hibikiUrl,
  hirame: hirameUrl,
  sasae: sasaeUrl,
  yukihiro: yukihiroUrl,
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
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

export async function loadArt(): Promise<GuildArt> {
  const [tiles, sprites, decor] = await Promise.all([loadTiles(), loadSprites(), loadDecor()]);
  if (decor === null) return { tiles, sprites, decor: placeholderArt.decor };
  return { tiles, sprites: { ...sprites, drawProp: decorProps(decor) }, decor };
}
