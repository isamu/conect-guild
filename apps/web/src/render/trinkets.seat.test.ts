import { describe, expect, it } from 'vitest';
import type { DecorName } from '../../../../assets/decor/decor';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { createAmbientSeeds, type AmbientMoods } from './ambient';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  sendHome,
  type AmbientContext,
  type Director,
} from './director';
import { homeWalk, type IdlePose } from './idle';
import { PLAY_SPOTS } from './idleSpots';
import { tileToPoint } from './path';
import { DEFAULT_SEATS, PICK_UP_MS } from './scenes';
import { activeSince, decorCuesOf, triggerOf } from './trinkets';

/**
 * Issue #29: a department's thing moves only while its member works at the seat. It stops while
 * the member walks in a scene or is out playing (idle.ts), and moves again once they sit down.
 */

const DEPARTMENTS: readonly {
  readonly label: DepartmentLabel;
  readonly member: MemberId;
  readonly things: readonly DecorName[];
}[] = [
  { label: '経理', member: 'minori', things: ['abacus', 'coin-pile'] },
  { label: '広報', member: 'hibiki', things: ['megaphone'] },
  { label: '企画', member: 'hirame', things: ['globe'] },
  { label: '総務', member: 'sasae', things: ['file-stack'] },
];

const WORKING: AmbientMoods = {
  minori: 'desk-work',
  hibiki: 'desk-work',
  hirame: 'desk-work',
  sasae: 'desk-work',
};

function ambientOf(moods: AmbientMoods, idle: AmbientContext['idle'] = {}): AmbientContext {
  return { moods, seeds: createAmbientSeeds(() => 0), hasHoldFrames: () => true, idle };
}

/** Whether each of the member's things moves at `now`, as the render loop decides it. */
function moving(
  director: Director,
  now: number,
  things: readonly DecorName[],
  ambient: AmbientContext,
): boolean[] {
  const { members } = frameAt(director, now, DEFAULT_SEATS, ambient);
  const cues = decorCuesOf(ambient.moods, director.bursts, now, members);
  return things.map((name) => activeSince(triggerOf({ name, row: 5 }), cues) !== null);
}

/** The member's chest handover to the counter: picks it up at the seat, walks there and back. */
function handover(label: DepartmentLabel): Director {
  return scheduleEvent(
    EMPTY_DIRECTOR,
    { id: 'pr-merged#1', kind: 'pr-merged', number: 1, department: label },
    0,
    { seats: DEFAULT_SEATS, random: () => 0.5 },
  );
}

function lastEnd(director: Director, id: MemberId): number {
  return director.busyUntil[id] ?? 0;
}

describe.each(DEPARTMENTS)(
  '$label: things follow $member at the seat',
  ({ label, member, things }) => {
    const still = things.map(() => false);
    const moves = things.map(() => true);

    it('moves while the member works at the seat', () => {
      expect(moving(EMPTY_DIRECTOR, 0, things, ambientOf(WORKING))).toEqual(moves);
    });

    it('keeps moving while the member picks the chest up at the seat', () => {
      expect(moving(handover(label), PICK_UP_MS / 2, things, ambientOf(WORKING))).toEqual(moves);
    });

    it('stops while the member walks to the counter and back, and moves again at the seat', () => {
      const director = handover(label);
      const back = lastEnd(director, member);
      const walking = [PICK_UP_MS + 1, (PICK_UP_MS + back) / 2, back - 1];
      for (const now of walking) {
        expect(moving(director, now, things, ambientOf(WORKING))).toEqual(still);
      }
      expect(moving(director, back, things, ambientOf(WORKING))).toEqual(moves);
    });

    it('stops while the member is out playing, and while walking back from play', () => {
      const spot = PLAY_SPOTS[member][0];
      expect(spot).toBeDefined();
      if (spot === undefined) return;
      const away: IdlePose = {
        feet: tileToPoint(spot.tile),
        step: { from: spot.tile, to: spot.tile, progress: 0 },
        frame: 0,
        flip: false,
        offset: { x: 0, y: 0 },
        mark: null,
      };
      // The mood may already say "working" while the member is still out (the walk back is to come).
      expect(moving(EMPTY_DIRECTOR, 0, things, ambientOf(WORKING, { [member]: away }))).toEqual(
        still,
      );
      const walk = homeWalk(away.step, DEFAULT_SEATS[member], 1_000);
      expect(walk).not.toBeNull();
      if (walk === null) return;
      const home = sendHome(EMPTY_DIRECTOR, member, walk);
      expect(moving(home, walk.start, things, ambientOf(WORKING))).toEqual(still);
      expect(moving(home, walk.end - 1, things, ambientOf(WORKING))).toEqual(still);
      expect(moving(home, walk.end, things, ambientOf(WORKING))).toEqual(moves);
    });

    it('stays still while the department does not work, at the seat or away', () => {
      const quiet = ambientOf({ [member]: 'idle' });
      expect(moving(EMPTY_DIRECTOR, 0, things, quiet)).toEqual(still);
      expect(moving(handover(label), PICK_UP_MS / 2, things, quiet)).toEqual(still);
      expect(moving(handover(label), PICK_UP_MS + 1, things, quiet)).toEqual(still);
    });
  },
);

describe('things of the other departments', () => {
  it('keep moving while one member walks away', () => {
    const director = handover('広報');
    const now = (PICK_UP_MS + lastEnd(director, 'hibiki')) / 2;
    const ambient = ambientOf(WORKING);
    expect(moving(director, now, ['megaphone'], ambient)).toEqual([false]);
    expect(moving(director, now, ['abacus', 'globe', 'file-stack'], ambient)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
