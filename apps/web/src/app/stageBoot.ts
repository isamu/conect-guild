/**
 * How the canvas stage starts (ui/GuildCanvas.vue), apart from the component so it can be tested:
 * the stage is loading its pictures, running, or could not start (no 2D context, for one). The
 * windows, messages and sounds go on without the room, so a failed stage must not hold them up.
 */
export type StageState = 'loading' | 'running' | 'failed';

/**
 * What to do with the scene cues queued so far: wait for the loop to run, play them, or drop them.
 * Dropped while the canvas is out of sight (they never play late) and when the stage failed (no
 * loop will ever take them, so they would only pile up).
 */
export function cueAction(stage: StageState, hidden: boolean): 'wait' | 'play' | 'drop' {
  if (hidden || stage === 'failed') return 'drop';
  return stage === 'running' ? 'play' : 'wait';
}

export interface StageBootHooks {
  /** The stage could not start: report it. Called before `ready`. */
  readonly failed: (error: unknown) => void;
  /** Called once, whether the stage started or not, so nothing waits on it for ever. */
  readonly ready: () => void;
}

/**
 * Runs `start` (the stage's start once its pictures are in) and tells how it went. Never throws:
 * `ready` is sent once in every case, and an error of `failed` itself is dropped (the state still
 * says failed, so the cues are dropped and nothing waits on the stage).
 */
export function bootStage(
  start: () => void,
  hooks: StageBootHooks,
): Exclude<StageState, 'loading'> {
  let state: Exclude<StageState, 'loading'> = 'running';
  try {
    start();
  } catch (error: unknown) {
    state = 'failed';
    report(hooks, error);
  }
  hooks.ready();
  return state;
}

function report(hooks: StageBootHooks, error: unknown): void {
  try {
    hooks.failed(error);
  } catch {
    // Nowhere left to report to; the failed state is what matters.
  }
}
