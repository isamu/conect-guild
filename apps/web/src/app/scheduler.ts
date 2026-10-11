export type Cancel = () => void;

/** Timer boundary, so tests can swap the clock. */
export interface Scheduler {
  every(ms: number, task: () => void): Cancel;
  after(ms: number, task: () => void): Cancel;
}

/** Uses the global timers at call time (so vitest's fake timers apply too). */
export const globalScheduler: Scheduler = {
  every(ms, task) {
    const id = setInterval(task, ms);
    return () => {
      clearInterval(id);
    };
  },
  after(ms, task) {
    const id = setTimeout(task, ms);
    return () => {
      clearTimeout(id);
    };
  },
};
