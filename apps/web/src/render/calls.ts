import type { MemberId } from '../guild.config';
import type { StageFrame } from './director';
import { DEFAULT_SEATS } from './scenes';
import {
  addSummons,
  endedSummons,
  holdsAt,
  isSummoning,
  newCallStart,
  pruneSummons,
  speechesAt,
  NO_HOLDS,
  withSummons,
  type Holds,
  type Speeches,
  type Summons,
} from './summons';

export interface CallsOptions {
  /** Epoch ms, for the time reported to `onActive`. */
  readonly wallNow?: () => number;
  /** Members active at `at` (epoch ms): the king once his call is over. */
  readonly onActive?: (ids: readonly MemberId[], at: number) => void;
  /** A call starts on the stage now: its sound rings with it. */
  readonly onCallStart?: () => void;
}

/** A frame with the king's call applied, its words, and whether calls go on after it. */
export interface CallView {
  readonly frame: StageFrame;
  readonly speeches: Speeches;
  readonly calling: boolean;
}

export interface Calls {
  /** The king calls `members` at stage time `t`, or after the call playing; none while halted. */
  add(members: readonly MemberId[], t: number): void;
  /** Halted (the screen is not live): the calls to come and the one playing are dropped. */
  setHalted(halted: boolean): void;
  /**
   * The frame at `t` with the call playing applied, and its words. Reports a call that starts
   * (`onCallStart`) and drops the finished ones.
   */
  view(frame: StageFrame, t: number): CallView;
}

/**
 * The king's calls (summons.ts, Issue #28) on the stage clock. Nobody's idle time moves while a
 * call plays, so a sleeper's pose stays where it is drawn. Once the last call is over the king, who gave
 * the order, is reported active (`onActive`): his doze starts over (idle.ts). The members are not:
 * their own session's work ends their idle spell (and brings them back from play), not the call.
 */
export function createCalls(options: CallsOptions): Calls {
  let list: readonly Summons[] = [];
  let announced: number | null = null;
  let holds: Holds = NO_HOLDS;
  let halted = false;
  return {
    add(members, t) {
      if (!halted) list = addSummons(list, members, t);
    },
    setHalted(next) {
      halted = next;
      if (halted) {
        list = [];
        holds = NO_HOLDS;
      }
    },
    view(frame, t) {
      const speeches = speechesAt(list, t);
      holds = holdsAt(holds, frame, list, t);
      const applied = withSummons(frame, list, t, { seats: DEFAULT_SEATS, holds });
      const started = newCallStart(list, t, announced);
      if (started !== null) {
        announced = started;
        options.onCallStart?.();
      }
      const ended = endedSummons(list, t).length > 0;
      list = pruneSummons(list, t);
      // After the last call of a row: the king's pose stays put through all of them.
      if (ended && list.length === 0)
        options.onActive?.(['yukihiro'], (options.wallNow ?? Date.now)());
      return { frame: applied, speeches, calling: isSummoning(list, t) };
    },
  };
}
