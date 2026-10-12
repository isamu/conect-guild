import type { MemberId } from '../guild.config';
import { createAmbientSeeds, type AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import { createCalls, type CallsOptions, type CallView, type Calls } from './calls';
import type { Random } from './confetti';
import { frameAt, hushed, isAnimating, type Director, type StageFrame } from './director';
import type { IdleSeeds, IdleSince } from './idle';
import { createIdleCrew, type IdleCrew } from './idleCrew';
import type { LinePicker, PickLine, SpokenLines } from './lines';
import {
  isFree,
  isRemarking,
  NO_REMARKS,
  pruneRemarks,
  receiveParty,
  remarksAt,
  seenRemarks,
  silenced,
  type RemarkParty,
  type Remarks,
} from './remarks';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import { decorCuesOf, type DecorCues } from './trinkets';

/**
 * The render loop's cast (render/loop.ts): the members' small moves and long idle spells over the
 * director's scenes, the king's calls, and the lines on starting to wait (remarks.ts, Issue #47).
 */

/** What the cast takes of a party (loop.StageParty). */
export interface CastParty extends RemarkParty {
  readonly idleSince: IdleSince;
}

export interface Cast {
  readonly crew: IdleCrew;
  readonly calls: Calls;
  frame(director: Director, t: number, moods: AmbientMoods): StageFrame;
  /**
   * Takes a new party at stage time `t`: the idle times (members whose time changed walk back), the
   * halt, and who starts waiting (remarks.ts; nothing is said while `quiet`, nothing is drawn).
   */
  receive(director: Director, party: CastParty, at: { t: number; quiet: boolean }): Director;
  /**
   * The remarks at `t` (dropping those that are over), noting those seen over the heads of `view`
   * (remarks.seenRemarks), and whether any shows or is to come.
   */
  remarksAt(
    t: number,
    view: Pick<CallView, 'frame' | 'speeches'>,
  ): { readonly remarks: SpokenLines; readonly remarking: boolean };
  /** Drops the remarks said and to come (the canvas is out of sight). */
  silence(): void;
}

/** Where the remarks draw their chance and their line from, and tell what was seen (Issue #47). */
export interface Talk {
  readonly random: Random;
  readonly pick: PickLine | undefined;
  readonly saw: LinePicker['saw'];
}

/** The members' small moves and long idle spells over the director's scenes, and the king's calls. */
export function createCast(
  art: GuildArt,
  random: Random,
  options: CallsOptions & { readonly idleSeeds?: IdleSeeds },
  talk: Talk,
): Cast {
  const seeds = createAmbientSeeds(random);
  const hasHoldFrames = (id: MemberId): boolean => art.sprites.hasHoldFrames(id);
  const crew = createIdleCrew({
    random,
    seeds: options.idleSeeds,
    wallNow: options.wallNow ?? (() => Date.now()),
    onActive: options.onActive,
  });
  const calls = createCalls(options);
  let remarks: Remarks = NO_REMARKS;
  return {
    crew,
    calls,
    receive: (director, party, at) => {
      calls.setHalted(party.halted);
      const next = crew.setSince(party.halted ? hushed(director) : director, party.idleSince, at.t);
      // After the walks back: a member called home now is not free to speak.
      const free = (id: MemberId) => isFree(next, at.t, id, crew.poses());
      remarks = receiveParty(remarks, party, { ...at, ...talk, free });
      return next;
    },
    remarksAt: (t, view) => {
      talk.saw(seenRemarks(remarks, t, view), t);
      remarks = pruneRemarks(remarks, t);
      return { remarks: remarksAt(remarks, t), remarking: isRemarking(remarks, t) };
    },
    silence: () => {
      remarks = silenced(remarks);
    },
    frame: (director, t, moods) =>
      frameAt(director, t, DEFAULT_SEATS, {
        moods,
        seeds,
        hasHoldFrames,
        idle: crew.frame(director, t),
      }),
  };
}

/**
 * What the stage shows at `t`: the members with the king's call, its words, the remarks, the small
 * things, and whether anything still moves or is to come.
 */
export function stageAt(
  cast: Cast,
  director: Director,
  t: number,
  moods: AmbientMoods,
): CallView & {
  readonly remarks: SpokenLines;
  readonly animating: boolean;
  readonly cues: DecorCues;
} {
  // The king woken by the end of a call (onActive) never leaves the throne: `director` stays good.
  const view = cast.calls.view(() => cast.frame(director, t, moods), t);
  const cues = decorCuesOf(moods, director.bursts, t, view.frame.members);
  const { remarks, remarking } = cast.remarksAt(t, view);
  return { ...view, remarks, animating: isAnimating(director, t) || remarking, cues };
}

/**
 * Where the remarks (remarks.ts) draw their chance and their line from: `lineRandom` and the picker
 * of the scenes, so a member does not repeat a line whichever way it came.
 */
export function talkOf(
  options: { readonly lineRandom?: Random },
  context: SceneContext & { readonly sawLines: LinePicker['saw'] },
): Talk {
  return {
    random: options.lineRandom ?? Math.random,
    pick: context.pickLine,
    saw: context.sawLines,
  };
}
