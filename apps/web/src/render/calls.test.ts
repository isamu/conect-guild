import { describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { createCalls } from './calls';
import { EMPTY_DIRECTOR, frameAt, type StageFrame } from './director';
import { DEFAULT_SEATS } from './scenes';
import { summonsEnd } from './summons';

/** The king's calls on the stage (Issue #28): who is reported active, and when a call starts. */

const WALL = 1_700_000_000_000;
const END = summonsEnd({ start: 0, members: [] });

function setup() {
  const onActive = vi.fn<(ids: readonly MemberId[], at: number) => void>();
  const onCallStart = vi.fn<() => void>();
  const calls = createCalls({ wallNow: () => WALL, onActive, onCallStart });
  const frame: StageFrame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
  return { calls, frame, onActive, onCallStart };
}

describe('createCalls: idle times', () => {
  it('reports nobody active when a call is added or while it plays (sleepers stay put)', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori'], 0);
    calls.view(frame, 0);
    calls.view(frame, END - 1);
    expect(onActive).not.toHaveBeenCalled();
  });

  it('reports only the king active once the call is over, never the members', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori', 'kaname'], 0);
    calls.view(frame, END);
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledWith(['yukihiro'], WALL);
    calls.view(frame, END + 1);
    expect(onActive).toHaveBeenCalledTimes(1);
  });
});

describe('createCalls: starts', () => {
  it('reports a call when it starts on the stage, once', () => {
    const { calls, frame, onCallStart } = setup();
    calls.add(['kaname'], 100);
    expect(onCallStart).not.toHaveBeenCalled();
    calls.view(frame, 100);
    calls.view(frame, 200);
    expect(onCallStart).toHaveBeenCalledTimes(1);
  });

  it('reports the second call of a row when it starts, not when it is added', () => {
    const { calls, frame, onCallStart } = setup();
    calls.add(['kaname'], 0);
    calls.view(frame, 0);
    calls.add(['sasae'], 10);
    calls.view(frame, 10);
    calls.view(frame, END - 1);
    expect(onCallStart).toHaveBeenCalledTimes(1);
    calls.view(frame, END);
    expect(onCallStart).toHaveBeenCalledTimes(2);
  });

  it('says whether calls go on, and hands back the words', () => {
    const { calls, frame } = setup();
    expect(calls.view(frame, 0).calling).toBe(false);
    calls.add(['kaname'], 0);
    const view = calls.view(frame, 0);
    expect(view.calling).toBe(true);
    expect(view.speeches).toEqual({ yukihiro: '！' });
    expect(calls.view(frame, END).calling).toBe(false);
  });
});
