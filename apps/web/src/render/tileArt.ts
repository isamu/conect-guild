import { TILES } from '../../../../assets/tiles/tiles';
import type { TileArt } from './art';
import type { TileName, TileRect } from './map';
import { TILE_SIZE } from './metrics';

/** The real tiles: pieces cut from assets/tiles/tileset.png (positions in tiles.ts). */

/** One drawImage call: source rectangle in the sheet, destination in logical pixels. */
export interface TileDraw {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
}

/**
 * Covers `area` with the piece for `tile`: one copy per piece-sized step, the last ones cut off
 * where the area ends (a 9-wide counter is three 3-wide counter pieces). Pure.
 */
export function tileDraws(tile: TileName, area: TileRect): TileDraw[] {
  const piece = TILES[tile];
  const draws: TileDraw[] = [];
  for (let row = 0; row < area.h; row += piece.h) {
    for (let col = 0; col < area.w; col += piece.w) {
      const w = Math.min(piece.w, area.w - col) * TILE_SIZE;
      const h = Math.min(piece.h, area.h - row) * TILE_SIZE;
      draws.push({
        sx: piece.col * TILE_SIZE,
        sy: piece.row * TILE_SIZE,
        sw: w,
        sh: h,
        dx: (area.col + col) * TILE_SIZE,
        dy: (area.row + row) * TILE_SIZE,
        dw: w,
        dh: h,
      });
    }
  }
  return draws;
}

export function createTileArt(sheet: CanvasImageSource): TileArt {
  return {
    drawTile(ctx, tile, area) {
      for (const d of tileDraws(tile, area)) {
        ctx.drawImage(sheet, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
      }
    },
  };
}
