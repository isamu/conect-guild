import type { MemberId } from '../guild.config';
import type { Random } from './confetti';
import { inScene, sendHome, type Director } from './director';
import { awayTile, createIdleSeeds, idlePosesAt, type IdlePoses, type IdleSince } from './idle';
import { DEFAULT_SEATS } from './scenes';

/**
 * The render loop's memory of the long idle spells (idle.ts): since when each member has had
 * nothing to do, and when each was last in a scene (their spell starts over after it). It hands
 * back a new director when members out playing must walk back to their seat: when work comes
 * (their idle time changes) or when a scene needs them. `t` is stage time, `wall` epoch ms.
 */
export interface IdleCrew {
  /**
   * For one frame at stage time `t`: notes who is in a scene now (reported to `onActive`) and
   * returns the poses of the members in a long idle spell.
   */
  frame(director: Director, t: number): IdlePoses;
  /** New idle times; members whose time changed walk back if they are away. */
  setSince(director: Director, next: IdleSince, t: number): Director;
  /** The cast of a scene about to be scheduled: they walk back if away, and are active now. */
  callCast(director: Director, cast: readonly MemberId[], t: number): Director;
}

export interface IdleCrewOptions {
  readonly random: Random;
  /** Epoch ms: the idle spells go on while the page is hidden. */
  readonly wallNow: () => number;
  /** Members in a scene at `at` (epoch ms), on every frame that shows them in one. */
  readonly onActive: ((ids: readonly MemberId[], at: number) => void) | undefined;
}

const MEMBER_IDS: readonly MemberId[] = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'yukihiro',
];

export function createIdleCrew(options: IdleCrewOptions): IdleCrew {
  const { wallNow, onActive } = options;
  const seeds = createIdleSeeds(options.random);
  let since: IdleSince = {};
  const sceneSeen: Partial<Record<MemberId, number>> = {};

  /** The idle times, each moved on to the member's last scene. */
  function current(): IdleSince {
    const merged: Partial<Record<MemberId, number>> = { ...since };
    for (const id of MEMBER_IDS) {
      const at = merged[id];
      if (at !== undefined) merged[id] = Math.max(at, sceneSeen[id] ?? at);
    }
    return merged;
  }

  /** Members away from their seat (out playing) walk back from where they are now. */
  function callHome(director: Director, ids: readonly MemberId[], t: number): Director {
    const poses = idlePosesAt(current(), seeds, wallNow());
    let next = director;
    for (const id of ids) {
      const feet = poses[id]?.feet;
      const seat = DEFAULT_SEATS[id];
      const from = feet === undefined ? null : awayTile(feet, seat);
      if (from !== null && !inScene(next, id, t)) next = sendHome(next, { id, from, seat }, t);
    }
    return next;
  }

  return {
    frame(director, t) {
      const wall = wallNow();
      const ids = MEMBER_IDS.filter((id) => inScene(director, id, t));
      for (const id of ids) sceneSeen[id] = wall;
      if (ids.length > 0) onActive?.(ids, wall);
      return idlePosesAt(current(), seeds, wall);
    },
    setSince(director, next, t) {
      const changed = MEMBER_IDS.filter((id) => next[id] !== since[id]);
      const moved = callHome(director, changed, t);
      since = next;
      return moved;
    },
    callCast(director, cast, t) {
      const moved = callHome(director, cast, t);
      const wall = wallNow();
      for (const id of cast) sceneSeen[id] = wall;
      return moved;
    },
  };
}
