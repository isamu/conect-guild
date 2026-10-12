import { describe, expect, it, vi } from 'vitest';
import { EMPTY_CUE_QUEUE, receiveCue, takeCues, type CueQueue } from './guildView';
import { bootStage, cueAction, type StageState } from './stageBoot';

const cue = (id: number) =>
  ({
    id,
    event: {
      id: `issue-opened#${String(id)}`,
      kind: 'issue-opened',
      number: id,
      department: '経理',
    },
  }) as const;

/** The cue queue as GuildCanvas.playCues handles it: wait, or take (and play or drop). */
function handle(queue: CueQueue, stage: StageState, hidden: boolean) {
  const action = cueAction(stage, hidden);
  if (action === 'wait') return { queue, played: [] };
  const taken = takeCues(queue);
  return { queue: taken.queue, played: action === 'play' ? taken.play : [] };
}

describe('cueAction', () => {
  it('waits while the pictures load and plays once the stage runs', () => {
    expect(cueAction('loading', false)).toBe('wait');
    expect(cueAction('running', false)).toBe('play');
  });

  it('drops while the canvas is out of sight, whatever the stage', () => {
    for (const stage of ['loading', 'running', 'failed'] as const)
      expect(cueAction(stage, true)).toBe('drop');
  });

  it('drops after the stage failed: no loop will ever take the cues', () => {
    expect(cueAction('failed', false)).toBe('drop');
  });

  it('keeps no cues after a failed start, however many messages come (they do not pile up)', () => {
    let queue = EMPTY_CUE_QUEUE;
    for (let id = 1; id <= 50; id += 1) {
      queue = handle(receiveCue(queue, cue(id)), 'failed', false).queue;
      expect(queue.waiting).toEqual([]);
    }
    // While loading they wait, and play in order once the stage runs.
    queue = receiveCue(receiveCue(queue, cue(51)), cue(52));
    expect(handle(queue, 'loading', false).queue.waiting).toHaveLength(2);
    expect(handle(queue, 'running', false).played.map((c) => c.id)).toEqual([51, 52]);
  });
});

describe('bootStage', () => {
  it('runs the stage and sends ready once, with no failure', () => {
    const order: string[] = [];
    const state = bootStage(() => order.push('start'), {
      failed: () => order.push('failed'),
      ready: () => order.push('ready'),
    });
    expect(state).toBe('running');
    expect(order).toEqual(['start', 'ready']);
  });

  it('reports a stage that cannot start (no 2D context), then still sends ready once', () => {
    const noContext = new Error('2D canvas is not available');
    const failed = vi.fn();
    const ready = vi.fn();
    const state = bootStage(
      () => {
        throw noContext;
      },
      { failed, ready },
    );
    expect(state).toBe('failed');
    expect(failed).toHaveBeenCalledExactlyOnceWith(noContext);
    expect(ready).toHaveBeenCalledOnce();
    // The failure is reported before ready, so the screen knows before the demo may start.
    expect(failed.mock.invocationCallOrder[0]).toBeLessThan(ready.mock.invocationCallOrder[0] ?? 0);
  });

  it('still sends ready when reporting the failure throws', () => {
    const ready = vi.fn();
    expect(() =>
      bootStage(
        () => {
          throw new Error('no 2D context');
        },
        {
          failed: () => {
            throw new Error('the report failed');
          },
          ready,
        },
      ),
    ).toThrow('the report failed');
    expect(ready).toHaveBeenCalledOnce();
  });
});
