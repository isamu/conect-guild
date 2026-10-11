import hibikiUrl from '../../../../assets/sprites/hibiki.png';
import hirameUrl from '../../../../assets/sprites/hirame.png';
import kanameUrl from '../../../../assets/sprites/kaname.png';
import minoriUrl from '../../../../assets/sprites/minori.png';
import sasaeUrl from '../../../../assets/sprites/sasae.png';
import yukihiroUrl from '../../../../assets/sprites/yukihiro.png';
import tilesetUrl from '../../../../assets/tiles/tileset.png';
import type { MemberId } from '../guild.config';
import {
  drawPlaceholderProp,
  placeholderArt,
  type GuildArt,
  type SpriteArt,
  type TileArt,
} from './art';
import { createSpriteArt } from './spriteArt';
import { createTileArt } from './tileArt';

/**
 * Loads the pictures (bundled by Vite from assets/, never from another origin) and builds the art.
 * When a picture cannot be loaded, its part (tiles or members) falls back to the placeholder
 * boxes, so the stage still shows.
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

export async function loadArt(): Promise<GuildArt> {
  const [tiles, sprites] = await Promise.all([loadTiles(), loadSprites()]);
  return { tiles, sprites };
}
