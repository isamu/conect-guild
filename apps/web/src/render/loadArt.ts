import tilesetUrl from '../../../../assets/tiles/tileset.png';
import { placeholderArt, type GuildArt } from './art';
import { createTileArt } from './tileArt';

/**
 * Loads the pictures (bundled by Vite from assets/, never from another origin) and builds the art.
 * When a picture cannot be loaded, its part falls back to the placeholder boxes, so the stage
 * still shows. Sprites stay placeholders until assets/sprites/ exists.
 */

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadArt(): Promise<GuildArt> {
  try {
    const sheet = await loadImage(tilesetUrl);
    return { tiles: createTileArt(sheet), sprites: placeholderArt.sprites };
  } catch {
    return placeholderArt;
  }
}
