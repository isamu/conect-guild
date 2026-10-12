import { describe, expect, it } from 'vitest';
import { HOLD, OVERHEAD_OFFSET } from './metrics';
import {
  carry,
  heldItemPoint,
  MS_PER_TILE,
  raise,
  poseOnSegment,
  standingPose,
  staySegment,
  STEP_FRAME_MS,
  walkSegment,
} from './motion';
import { tileToPoint } from './path';

const A = { col: 2, row: 2 };
const B = { col: 3, row: 2 };
const C = { col: 3, row: 3 };

describe('segments', () => {
  it('stays for the given time, empty-handed by default', () => {
    expect(staySegment(A, 100, 500)).toEqual({ start: 100, end: 600, path: [A], held: null });
    expect(staySegment(A, 0, 10, raise('chest')).held).toEqual({ prop: 'chest', hold: 'raise' });
  });

  it('walks at a fixed pace per step; a one-tile walk takes no time', () => {
    expect(walkSegment([A, B, C], 1000).end).toBe(1000 + 2 * MS_PER_TILE);
    expect(walkSegment([A], 1000).end).toBe(1000);
    expect(walkSegment([A, B], 0, carry('scroll')).held).toEqual({ prop: 'scroll', hold: 'carry' });
  });
});

describe('poseOnSegment', () => {
  const walk = walkSegment([A, B, C], 0);

  it('stands facing front on a stay', () => {
    expect(poseOnSegment(staySegment(A, 0, 100, raise('scroll')), 50)).toEqual({
      point: tileToPoint(A),
      frame: 0,
      flip: false,
      held: raise('scroll'),
    });
  });

  it('moves from tile to tile in step with time', () => {
    expect(poseOnSegment(walk, 0).point).toEqual(tileToPoint(A));
    expect(poseOnSegment(walk, MS_PER_TILE / 2).point).toEqual({ x: 96, y: 96 });
    expect(poseOnSegment(walk, MS_PER_TILE).point).toEqual(tileToPoint(B));
    expect(poseOnSegment(walk, walk.end).point).toEqual(tileToPoint(C));
  });

  it('clamps times outside the segment to its ends', () => {
    expect(poseOnSegment(walk, -500).point).toEqual(tileToPoint(A));
    expect(poseOnSegment(walk, walk.end + 500).point).toEqual(tileToPoint(C));
  });

  it('alternates the two walking frames', () => {
    expect(poseOnSegment(walk, 0).frame).toBe(2);
    expect(poseOnSegment(walk, STEP_FRAME_MS).frame).toBe(3);
    expect(poseOnSegment(walk, 2 * STEP_FRAME_MS).frame).toBe(2);
  });

  it('faces left only after a step to the left, and keeps facing on vertical steps', () => {
    expect(poseOnSegment(walk, 10).flip).toBe(false);
    expect(poseOnSegment(walk, MS_PER_TILE + 10).flip).toBe(false);
    const back = walkSegment([B, A, { col: 2, row: 3 }], 0);
    expect(poseOnSegment(back, 10).flip).toBe(true);
    expect(poseOnSegment(back, MS_PER_TILE + 10).flip).toBe(true);
  });

  it('faces right when the walk is only vertical', () => {
    expect(poseOnSegment(walkSegment([B, C], 0), 10).flip).toBe(false);
  });

  it('carries the item the way the segment holds it', () => {
    expect(poseOnSegment(walkSegment([A, B], 0, carry('chest')), 10).held).toEqual(carry('chest'));
  });
});

describe('standingPose', () => {
  it('stands at the tile, facing front, empty-handed', () => {
    expect(standingPose(A)).toEqual({
      point: tileToPoint(A),
      frame: 0,
      flip: false,
      held: null,
    });
  });
});

describe('heldItemPoint', () => {
  const point = { x: 100, y: 200 };

  it('raises the item over the head, whichever way the member faces', () => {
    for (const [frame, flip] of [
      [0, false],
      [1, false],
      [2, true],
    ] as const) {
      expect(heldItemPoint({ point, frame, flip }, 'raise')).toEqual({
        x: 100,
        y: 200 - OVERHEAD_OFFSET,
      });
    }
  });

  it('carries it in front of the middle of the body when facing front', () => {
    expect(heldItemPoint({ point, frame: 0, flip: false }, 'carry')).toEqual({
      x: 100,
      y: 200 - HOLD.carryHeightPx,
    });
    // A front frame is never mirrored, but a stray flip must not move it either.
    expect(heldItemPoint({ point, frame: 0, flip: true }, 'carry').x).toBe(100);
  });

  it.each([1, 2, 3] as const)('carries it forward at the hands on side frame %i', (frame) => {
    const y = 200 - HOLD.carryHeightPx;
    expect(heldItemPoint({ point, frame, flip: false }, 'carry')).toEqual({
      x: 100 + HOLD.carryForwardPx,
      y,
    });
    expect(heldItemPoint({ point, frame, flip: true }, 'carry')).toEqual({
      x: 100 - HOLD.carryForwardPx,
      y,
    });
  });

  it('carries it between the chest and the waist, below the head', () => {
    expect(HOLD.carryHeightPx).toBeGreaterThan(20);
    expect(HOLD.carryHeightPx).toBeLessThan(OVERHEAD_OFFSET / 2);
  });
});
