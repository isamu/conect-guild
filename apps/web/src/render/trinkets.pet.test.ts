import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { createAmbientSeeds } from './ambient';
import { EMPTY_DIRECTOR, frameAt, sendHome, type AmbientContext, type Director } from './director';
import { homeWalk, idlePose, plannedOuting, type IdleActivity, type Outing } from './idle';
import { TRINKETS } from './metrics';
import { DEFAULT_SEATS } from './scenes';
import { decorCuesOf, NO_CUES, PET_AWAKE_DECOR, petAwakeAt, petPoseAt } from './trinkets';

/**
 * Issue #39: the pet is up and sitting all the while someone out playing stays by it, from the
 * moment they arrive until they start walking back. With nobody there it sleeps as before.
 */

/** The start of a play cycle far from zero, like a real epoch time. */
const CYCLE = 7_000_000;

function outingFor(id: MemberId, kind: string): Outing {
  for (let salt = 0; salt < 100_000; salt += 1) {
    const outing = plannedOuting(id, salt, CYCLE);
    if (outing?.spot.kind === kind) return outing;
  }
  throw new Error(`no outing for ${id} ${kind}`);
}

const PET_OUTING = outingFor('kaname', 'pet');

function ambientOf(id: MemberId, activity: IdleActivity, now: number): AmbientContext {
  const idle = { [id]: idlePose(activity, DEFAULT_SEATS[id], 1, now) };
  return { moods: {}, seeds: createAmbientSeeds(() => 0), hasHoldFrames: () => true, idle };
}

/** Whether someone stays by the pet at `now`, as the render loop decides it. */
function company(director: Director, now: number, ambient: AmbientContext): boolean {
  const { members } = frameAt(director, now, DEFAULT_SEATS, ambient);
  return decorCuesOf({}, director.bursts, now, members).petCompany;
}

const byPet = (now: number) =>
  company(EMPTY_DIRECTOR, now, ambientOf('kaname', { kind: 'play', outing: PET_OUTING }, now));

describe('the pet with company', () => {
  it('is up from the moment the member arrives until the walk back starts', () => {
    const { out, back } = PET_OUTING;
    expect(byPet(out.start)).toBe(false);
    expect(byPet(out.end - 1)).toBe(false);
    expect(byPet(out.end)).toBe(true);
    expect(byPet(back.start - 1)).toBe(true);
    expect(byPet(back.start)).toBe(false);
    expect(byPet(back.end - 1)).toBe(false);
  });

  it('marks the pose by the pet only, not the other spots or dozing and sleeping', () => {
    const pose = (activity: IdleActivity, now: number) =>
      idlePose(activity, DEFAULT_SEATS.minori, 1, now).withPet;
    for (const kind of ['tea', 'window', 'chat']) {
      const outing = outingFor('minori', kind);
      expect(pose({ kind: 'play', outing }, outing.out.end)).toBe(false);
    }
    expect(pose({ kind: 'doze' }, 0)).toBe(false);
    expect(pose({ kind: 'sleep' }, 0)).toBe(false);
  });

  it('is left alone once the member is called back into a scene', () => {
    const now = PET_OUTING.out.end + 1_000;
    const ambient = ambientOf('kaname', { kind: 'play', outing: PET_OUTING }, now);
    const step = ambient.idle?.kaname?.step;
    if (step === undefined) throw new Error('no pose');
    const walk = homeWalk(step, DEFAULT_SEATS.kaname, now);
    if (walk === null) throw new Error('no walk');
    expect(company(sendHome(EMPTY_DIRECTOR, 'kaname', walk), now, ambient)).toBe(false);
  });

  it('has no company with nobody idle', () => {
    const asleep = ambientOf('kaname', { kind: 'sleep' }, 0);
    expect(company(EMPTY_DIRECTOR, 0, asleep)).toBe(false);
    expect(NO_CUES.petCompany).toBe(false);
  });
});

describe('petPoseAt with company', () => {
  /** A moment the pet would sleep through on its own. */
  const asleep = TRINKETS.petSitMs;

  it('sits up all the while someone stays by it', () => {
    expect(petAwakeAt(0, asleep)).toBe(false);
    for (let t: number = asleep; t < TRINKETS.petIntervalMs; t += 100) {
      expect(petPoseAt('sleeping-poodle', 0, t, true)).toEqual({ name: PET_AWAKE_DECOR, dy: 0 });
    }
  });

  it('sleeps and wakes on its own as before with nobody there', () => {
    expect(petPoseAt('sleeping-poodle', 0, asleep, false).name).toBe('sleeping-poodle');
    expect(petPoseAt('sleeping-poodle', 0, asleep - 1, false).name).toBe(PET_AWAKE_DECOR);
  });
});
