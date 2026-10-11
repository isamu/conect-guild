import { describe, expect, it } from 'vitest';
import {
  MS_PER_TILE,
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
  it('stays for the given time, visible and empty-handed by default', () => {
    expect(staySegment(A, 100, 500)).toEqual({
      start: 100,
      end: 600,
      path: [A],
      prop: null,
      visible: true,
    });
    expect(staySegment(A, 0, 10, { prop: 'chest', visible: false })).toMatchObject({
      prop: 'chest',
      visible: false,
    });
  });

  it('walks at a fixed pace per step; a one-tile walk takes no time', () => {
    expect(walkSegment([A, B, C], 1000).end).toBe(1000 + 2 * MS_PER_TILE);
    expect(walkSegment([A], 1000).end).toBe(1000);
    expect(walkSegment([A, B], 0, 'scroll').prop).toBe('scroll');
  });
});

describe('poseOnSegment', () => {
  const walk = walkSegment([A, B, C], 0);

  it('stands facing front on a stay', () => {
    expect(poseOnSegment(staySegment(A, 0, 100, { prop: 'scroll' }), 50)).toEqual({
      point: tileToPoint(A),
      frame: 0,
      flip: false,
      visible: true,
      prop: 'scroll',
    });
  });

  it('moves from tile to tile in step with time', () => {
    expect(poseOnSegment(walk, 0).point).toEqual(tileToPoint(A));
    expect(poseOnSegment(walk, MS_PER_TILE / 2).point).toEqual({ x: 48, y: 48 });
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

  it('carries visibility and prop', () => {
    const hidden = staySegment(A, 0, 100, { visible: false });
    expect(poseOnSegment(hidden, 10).visible).toBe(false);
    expect(poseOnSegment(walkSegment([A, B], 0, 'chest'), 10).prop).toBe('chest');
  });
});

describe('standingPose', () => {
  it('stands at the tile, facing front, empty-handed', () => {
    expect(standingPose(A)).toEqual({
      point: tileToPoint(A),
      frame: 0,
      flip: false,
      visible: true,
      prop: null,
    });
  });
});
