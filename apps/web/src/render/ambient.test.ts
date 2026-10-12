import { describe, expect, it } from 'vitest';
import type { MemberState } from '../domain/party';
import {
  AMBIENT_REST,
  ambientMoodOf,
  ambientMoodsOf,
  ambientPose,
  createAmbientSeeds,
  DECOR_MOTION,
  decorPose,
  type AmbientMood,
  type AmbientSeed,
} from './ambient';
import { AMBIENT } from './metrics';

const SEED: AmbientSeed = { phaseMs: 0, intervalMs: 10_000 };
const STATES: readonly MemberState[] = [
  'awaiting-permission',
  'awaiting-president',
  'awaiting-kaname',
  'busy',
  'working',
  'done',
  'idle',
];

/** Poses sampled every 20 ms over [from, to). */
function sample(mood: AmbientMood, seed: AmbientSeed, from: number, to: number) {
  const step = 20;
  const poses = [];
  for (let t = from; t < to; t += step) poses.push(ambientPose(mood, seed, t));
  return poses;
}

describe('ambientMoodOf', () => {
  it('gives department members desk work while working or busy, idle moves otherwise', () => {
    for (const state of STATES) {
      const working = state === 'working' || state === 'busy';
      expect(ambientMoodOf('minori', state)).toBe(working ? 'desk-work' : 'idle');
    }
  });

  it('has かなめ tidy the scroll with quests at the reception and fan without', () => {
    expect(ambientMoodOf('kaname', 'working')).toBe('tidy-scroll');
    expect(ambientMoodOf('kaname', 'idle')).toBe('fan');
    expect(ambientMoodOf('kaname', 'awaiting-kaname')).toBe('desk-work');
  });

  it('has かなめ work at the desk while her session is busy', () => {
    expect(ambientMoodOf('kaname', 'busy')).toBe('desk-work');
  });

  it('has anyone waiting for a permission look around instead of working', () => {
    expect(ambientMoodOf('kaname', 'awaiting-permission')).toBe('idle');
    expect(ambientMoodOf('hirame', 'awaiting-permission')).toBe('idle');
  });

  it('has the king fidget only while PRs wait for him', () => {
    expect(ambientMoodOf('yukihiro', 'awaiting-president')).toBe('fidget');
    expect(ambientMoodOf('yukihiro', 'idle')).toBe('idle');
  });

  it('maps party rows by id, and nothing for no rows', () => {
    expect(
      ambientMoodsOf([
        { id: 'kaname', state: 'idle' },
        { id: 'sasae', state: 'working' },
      ]),
    ).toEqual({ kaname: 'fan', sasae: 'desk-work' });
    expect(ambientMoodsOf([])).toEqual({});
  });
});

describe('createAmbientSeeds', () => {
  it('draws intervals within the limits and phases within the interval', () => {
    // Two draws per member: interval, then phase. 1 - 1e-9 is the largest value a Random gives.
    const top = 1 - 1e-9;
    const values = [0, 0, 0.5, 0.25, top, top, 0.1, 0.9, 0.3, 0.7, 0.6, 0.4];
    let i = 0;
    const seeds = createAmbientSeeds(() => values[i++] ?? 0);
    for (const seed of Object.values(seeds)) {
      expect(seed.intervalMs).toBeGreaterThanOrEqual(AMBIENT.minIntervalMs);
      expect(seed.intervalMs).toBeLessThanOrEqual(AMBIENT.maxIntervalMs);
      expect(seed.phaseMs).toBeGreaterThanOrEqual(0);
      expect(seed.phaseMs).toBeLessThan(seed.intervalMs);
    }
    expect(seeds.kaname).toEqual({ intervalMs: AMBIENT.minIntervalMs, phaseMs: 0 });
    expect(seeds.hibiki.intervalMs).toBe(AMBIENT.maxIntervalMs);
    expect(seeds.minori.intervalMs).not.toBe(seeds.hibiki.intervalMs);
  });

  it('gives every member a seed of their own from the injected source', () => {
    let n = 0;
    const seeds = createAmbientSeeds(() => (n++ % 12) / 12);
    expect(new Set(Object.values(seeds).map((s) => s.intervalMs)).size).toBe(6);
  });
});

describe('ambientPose: desk work', () => {
  it('turns aside for papers at the start of a cycle, alternating sides', () => {
    expect(ambientPose('desk-work', SEED, 0)).toMatchObject({ frame: 1, flip: false });
    expect(ambientPose('desk-work', SEED, 10_000)).toMatchObject({ frame: 1, flip: true });
    expect(ambientPose('desk-work', SEED, AMBIENT.pageTurnMs - 1).frame).toBe(1);
    expect(ambientPose('desk-work', SEED, AMBIENT.pageTurnMs).frame).toBe(0);
  });

  it('bobs the front frame by the typing px, never sideways, holding nothing', () => {
    const poses = sample('desk-work', SEED, AMBIENT.pageTurnMs, SEED.intervalMs);
    const ys = new Set(poses.map((p) => p.offset.y));
    expect(ys).toEqual(new Set([0, -AMBIENT.typingBobPx]));
    for (const p of poses) expect(p).toMatchObject({ frame: 0, offset: { x: 0 }, hand: null });
  });

  it('stays on the front frame with the bob when the sheet has no holding frames', () => {
    for (let t = 0; t < 2 * SEED.intervalMs; t += 20) {
      expect(ambientPose('desk-work', SEED, t, false)).toEqual(ambientPose('desk-work', SEED, t));
    }
  });
});

describe('ambientPose: typing with the holding frames', () => {
  const at = (t: number) => ambientPose('desk-work', SEED, t, true);

  it('switches the front frame and the arms-in-front frame every typingMs', () => {
    const start = AMBIENT.pageTurnMs;
    expect(at(start).frame).toBe(0);
    expect(at(start + AMBIENT.typingMs - 1).frame).toBe(0);
    expect(at(start + AMBIENT.typingMs).frame).toBe(5);
    expect(at(start + 2 * AMBIENT.typingMs - 1).frame).toBe(5);
    expect(at(start + 2 * AMBIENT.typingMs).frame).toBe(0);
  });

  it('uses only frames 0 and 5 while typing, facing front, holding nothing, without a bob', () => {
    const poses = [];
    for (let t = AMBIENT.pageTurnMs; t < SEED.intervalMs; t += 20) poses.push(at(t));
    expect(new Set(poses.map((p) => p.frame))).toEqual(new Set([0, 5]));
    for (const p of poses)
      expect(p).toMatchObject({ flip: false, offset: { x: 0, y: 0 }, hand: null });
  });

  it('still turns aside for papers at the start of a cycle', () => {
    expect(at(0)).toMatchObject({ frame: 1, flip: false });
    expect(at(SEED.intervalMs)).toMatchObject({ frame: 1, flip: true });
  });

  it('changes no other mood', () => {
    const others: readonly AmbientMood[] = ['idle', 'tidy-scroll', 'fan', 'fidget'];
    for (const mood of others) {
      for (let t = 0; t < 2 * SEED.intervalMs; t += 70) {
        expect(ambientPose(mood, SEED, t, true)).toEqual(ambientPose(mood, SEED, t, false));
      }
    }
  });
});

describe('ambientPose: idle', () => {
  it('looks right, then left, then rests on even cycles', () => {
    expect(ambientPose('idle', SEED, 0)).toMatchObject({ frame: 1, flip: false });
    expect(ambientPose('idle', SEED, AMBIENT.lookMs)).toMatchObject({ frame: 1, flip: true });
    expect(ambientPose('idle', SEED, 2 * AMBIENT.lookMs)).toEqual(AMBIENT_REST);
  });

  it('stretches up on odd cycles, then rests', () => {
    const start = SEED.intervalMs;
    expect(ambientPose('idle', SEED, start)).toEqual({
      ...AMBIENT_REST,
      offset: { x: 0, y: -AMBIENT.stretchPx },
    });
    expect(ambientPose('idle', SEED, start + AMBIENT.stretchMs)).toEqual(AMBIENT_REST);
  });

  it('rests most of the time', () => {
    const poses = sample('idle', SEED, 0, 2 * SEED.intervalMs);
    const resting = poses.filter((p) => p === AMBIENT_REST).length;
    expect(resting / poses.length).toBeGreaterThan(0.8);
  });

  it('shifts the cycle by the phase, so members do not move together', () => {
    const shifted: AmbientSeed = { phaseMs: 5_000, intervalMs: 10_000 };
    expect(ambientPose('idle', SEED, 0).frame).toBe(1);
    expect(ambientPose('idle', shifted, 0)).toEqual(AMBIENT_REST);
    expect(ambientPose('idle', shifted, 5_000).offset.y).toBe(-AMBIENT.stretchPx);
  });

  it('works before time zero and at large times (cycle index from floor)', () => {
    expect(ambientPose('idle', SEED, -20_000)).toMatchObject({ frame: 1, flip: false });
    expect(ambientPose('idle', SEED, -1)).toEqual(AMBIENT_REST);
    expect(ambientPose('idle', SEED, 1e12 + 10_000)).toMatchObject({ offset: { y: -4 } });
  });
});

describe('ambientPose: かなめ and the king', () => {
  it('fans by switching front and side frames, then rests', () => {
    const burst = sample('fan', SEED, 0, AMBIENT.fanBurstMs);
    expect(new Set(burst.map((p) => p.frame))).toEqual(new Set([0, 1]));
    expect(ambientPose('fan', SEED, AMBIENT.fanStrokeMs).frame).toBe(1);
    expect(ambientPose('fan', SEED, AMBIENT.fanBurstMs)).toEqual(AMBIENT_REST);
  });

  it('holds the scroll at hand all the time, nudging it during the burst', () => {
    const burst = sample('tidy-scroll', SEED, 0, AMBIENT.scrollBurstMs);
    const xs = new Set(burst.map((p) => p.hand?.offset.x));
    expect(xs).toEqual(new Set([-AMBIENT.scrollShakePx, AMBIENT.scrollShakePx]));
    const after = ambientPose('tidy-scroll', SEED, AMBIENT.scrollBurstMs);
    expect(after.hand).toEqual({ prop: 'scroll', offset: { x: 0, y: -AMBIENT.handHeightPx } });
    expect(after.frame).toBe(0);
  });

  it('sways the king left and right during the burst, still afterwards', () => {
    const burst = sample('fidget', SEED, 0, AMBIENT.fidgetBurstMs);
    expect(new Set(burst.map((p) => p.offset.x))).toEqual(
      new Set([-AMBIENT.fidgetPx, AMBIENT.fidgetPx]),
    );
    for (const p of burst) expect(p).toMatchObject({ frame: 0, offset: { y: 0 }, hand: null });
    expect(ambientPose('fidget', SEED, AMBIENT.fidgetBurstMs).offset).toEqual({ x: 0, y: 0 });
  });
});

describe('AMBIENT defaults', () => {
  it('stays quiet: small offsets, about 6 to 8 fps, moves shorter than the shortest cycle', () => {
    expect(1000 / AMBIENT.frameMs).toBeGreaterThanOrEqual(6);
    expect(1000 / AMBIENT.frameMs).toBeLessThanOrEqual(8);
    for (const px of [AMBIENT.typingBobPx, AMBIENT.scrollShakePx, AMBIENT.fidgetPx]) {
      expect(px).toBeLessThanOrEqual(2);
    }
    const longest = Math.max(
      AMBIENT.pageTurnMs,
      2 * AMBIENT.lookMs,
      AMBIENT.stretchMs,
      AMBIENT.fanBurstMs,
      AMBIENT.scrollBurstMs,
      AMBIENT.fidgetBurstMs,
    );
    expect(longest).toBeLessThan(AMBIENT.minIntervalMs);
  });
});

describe('decorPose', () => {
  it('flickers a flame with up to AMBIENT.flameGlow of added light, never moving it', () => {
    const glows = new Set<number>();
    for (let t = 0; t < 20 * AMBIENT.flameStepMs; t += AMBIENT.flameStepMs) {
      const pose = decorPose('flame', 0, t);
      expect(pose.dy).toBe(0);
      expect(pose.glow).toBeGreaterThanOrEqual(0);
      expect(pose.glow).toBeLessThan(AMBIENT.flameGlow);
      glows.add(pose.glow);
    }
    expect(glows.size).toBeGreaterThan(5);
  });

  it('keeps a flame steady within one step, and the same for the same time', () => {
    const step = 7 * AMBIENT.flameStepMs;
    expect(decorPose('flame', 0, step)).toEqual(
      decorPose('flame', 0, step + AMBIENT.flameStepMs - 1),
    );
    expect(decorPose('flame', 0, step)).toEqual(decorPose('flame', 0, step));
  });

  it('shifts a flame by its phase', () => {
    expect(decorPose('flame', AMBIENT.flameStepMs, 0)).toEqual(
      decorPose('flame', 0, AMBIENT.flameStepMs),
    );
  });

  it('lets the cat breathe: 1 px up for half of each breath, no light', () => {
    const half = AMBIENT.breathMs / 2;
    expect(decorPose('breath', 0, 0)).toEqual({ dy: 0, glow: 0 });
    expect(decorPose('breath', 0, half)).toEqual({ dy: -AMBIENT.breathPx, glow: 0 });
    expect(decorPose('breath', 0, AMBIENT.breathMs)).toEqual({ dy: 0, glow: 0 });
  });

  it('moves the lamps, the cat and the departments’ things (Issue #11), nothing else', () => {
    expect(DECOR_MOTION).toEqual({
      lantern: 'flame',
      sconce: 'flame',
      'pillar-lamp': 'flame',
      candlestick: 'flame',
      'sleeping-cat': 'breath',
      abacus: 'glint',
      'coin-pile': 'glint',
      megaphone: 'notes',
      globe: 'spin',
      'key-board': 'swing',
      hourglass: 'sand',
      banner: 'flutter',
    });
  });
});
