import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { crouchAt, idlePose, plannedOuting, type Outing } from './idle';
import { IDLE } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/** The start of a play cycle far from zero, like a real epoch time. */
const CYCLE = 7_000_000;

/** An outing in CYCLE to the spot of `kind`, its salt found by search. */
function outingFor(id: MemberId, kind: string): Outing {
  for (let salt = 0; salt < 100_000; salt += 1) {
    const outing = plannedOuting(id, salt, CYCLE);
    if (outing?.spot.kind === kind) return outing;
  }
  throw new Error(`no outing for ${id} ${kind}`);
}

const PET_OUTING = outingFor('kaname', 'pet');

const poseAt = (outing: Outing, now: number) =>
  idlePose({ kind: 'play', outing }, DEFAULT_SEATS.kaname, 1, now);

describe('crouching by the pet', () => {
  it('crouches at the end of every turn, standing again as the next one starts', () => {
    const dy = (elapsed: number) => poseAt(PET_OUTING, PET_OUTING.out.end + elapsed).offset;
    const down = IDLE.crouchEveryMs - IDLE.crouchMs;
    expect(dy(0)).toEqual({ x: 0, y: 0 });
    expect(dy(down - 1)).toEqual({ x: 0, y: 0 });
    expect(dy(down)).toEqual({ x: 0, y: IDLE.crouchPx });
    expect(dy(IDLE.crouchEveryMs - 1)).toEqual({ x: 0, y: IDLE.crouchPx });
    expect(dy(IDLE.crouchEveryMs)).toEqual({ x: 0, y: 0 });
    expect(dy(IDLE.crouchEveryMs + down)).toEqual({ x: 0, y: IDLE.crouchPx });
  });

  it('crouches only a few px, for less than half of each turn', () => {
    expect(IDLE.crouchPx).toBeGreaterThan(0);
    expect(IDLE.crouchPx).toBeLessThanOrEqual(4);
    expect(IDLE.crouchMs * 2).toBeLessThan(IDLE.crouchEveryMs);
    expect(crouchAt(IDLE.crouchEveryMs - IDLE.crouchMs)).toBe(IDLE.crouchPx);
  });

  it('stands up straight on the walks out and back', () => {
    expect(poseAt(PET_OUTING, PET_OUTING.out.end - 1).offset).toEqual({ x: 0, y: 0 });
    expect(poseAt(PET_OUTING, PET_OUTING.back.start).offset).toEqual({ x: 0, y: 0 });
  });

  it('does not crouch at the other spots', () => {
    for (const kind of ['tea', 'window', 'chat']) {
      const outing = outingFor('minori', kind);
      const elapsed = IDLE.crouchEveryMs - 1;
      expect(poseAt(outing, outing.out.end + elapsed).offset).toEqual({ x: 0, y: 0 });
    }
  });
});
