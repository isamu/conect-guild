import { MEMBERS, type MemberId } from '../guild.config';
import type { TileName, TileRect } from './map';
import { DETAIL_SCALE, TILE_SIZE } from './metrics';
import type { Prop, SpriteFrame } from './motion';
import type { Point } from './path';

/**
 * The boundary between the drawing code and the pictures. Everything that decides how a tile or a
 * member looks goes through these interfaces, so the real tileset (assets/tiles/) and sprites
 * (assets/sprites/) replace `placeholderArt` without touching the rest of render/.
 * All coordinates are logical pixels (1024 x 576).
 */

export interface TileArt {
  /** Draws one tile kind over `area` (tile units; furniture may span several cells). */
  drawTile(ctx: CanvasRenderingContext2D, tile: TileName, area: TileRect): void;
}

export interface SpriteArt {
  /**
   * Draws a member with their feet at `feet`. Frames: 0 front, 1 side standing, 2 and 3 side
   * walking; the side frames face right and `flip` mirrors them to face left.
   */
  drawMember(
    ctx: CanvasRenderingContext2D,
    id: MemberId,
    pose: { readonly frame: SpriteFrame; readonly flip: boolean },
    feet: Point,
  ): void;
  /** Draws a held item centred on `at` (over the member's head). */
  drawProp(ctx: CanvasRenderingContext2D, prop: Prop, at: Point): void;
}

export interface GuildArt {
  readonly tiles: TileArt;
  readonly sprites: SpriteArt;
}

const TILE_COLORS: Readonly<Record<TileName, string>> = {
  floor: '#8a5a32',
  'floor-carpet': '#36508a',
  wall: '#5b3a22',
  'wall-top': '#2e1d12',
  window: '#9fd3f0',
  door: '#3c2414',
  counter: '#b07a3e',
  desk: '#a0682f',
  chair: '#6e4424',
  shelf: '#4e3220',
  plant: '#3f8a3a',
  throne: '#c9a227',
  'rug-red': '#a3262e',
  board: '#d8c08a',
  crate: '#7a5530',
};

/** Ground kinds are flat fills; furniture gets an outline so it reads as an object. */
const FLAT_TILES: ReadonlySet<TileName> = new Set<TileName>([
  'floor',
  'floor-carpet',
  'rug-red',
  'wall',
  'wall-top',
]);

const placeholderTiles: TileArt = {
  drawTile(ctx, tile, area) {
    const x = area.col * TILE_SIZE;
    const y = area.row * TILE_SIZE;
    const w = area.w * TILE_SIZE;
    const h = area.h * TILE_SIZE;
    ctx.fillStyle = TILE_COLORS[tile];
    ctx.fillRect(x, y, w, h);
    if (FLAT_TILES.has(tile)) return;
    ctx.strokeStyle = '#1b120b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },
};

const PROP_COLORS: Readonly<Record<Prop, string>> = { scroll: '#f3e2b3', chest: '#c58b2a' };

const placeholderSprites: SpriteArt = {
  drawMember(ctx, id, pose, feet) {
    const member = MEMBERS[id];
    const bob = pose.frame === 3 ? 1 : 0;
    // Drawn in detail pixels around the feet.
    ctx.save();
    ctx.translate(Math.round(feet.x), Math.round(feet.y));
    ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
    const left = -6;
    const top = -26 - bob;
    ctx.fillStyle = member.color;
    ctx.fillRect(left, top + 10, 12, 16);
    ctx.fillStyle = '#f2d0a9';
    ctx.fillRect(left + 1, top, 10, 10);
    // An eye on the facing side (front: both).
    ctx.fillStyle = '#1b120b';
    if (pose.frame === 0 || !pose.flip) ctx.fillRect(left + 7, top + 4, 2, 2);
    if (pose.frame === 0 || pose.flip) ctx.fillRect(left + 3, top + 4, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Names come from guild.config.ts, not from GitHub.
    ctx.fillText(member.name.charAt(0), left + 6, top + 18);
    ctx.restore();
  },
  drawProp(ctx, prop, at) {
    ctx.save();
    ctx.translate(Math.round(at.x), Math.round(at.y));
    ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
    ctx.fillStyle = PROP_COLORS[prop];
    ctx.fillRect(-5, -3, 10, 6);
    ctx.strokeStyle = '#1b120b';
    ctx.lineWidth = 1;
    ctx.strokeRect(-4.5, -2.5, 9, 5);
    ctx.restore();
  },
};

/** Coloured boxes until the real tiles and sprites arrive. */
export const placeholderArt: GuildArt = { tiles: placeholderTiles, sprites: placeholderSprites };
