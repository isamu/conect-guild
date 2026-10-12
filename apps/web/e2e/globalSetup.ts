import { claimDataDir } from './snapshotFile.ts';

/** Creates .data for the run; the returned function (the global teardown) removes it. */
export default function globalSetup(): Promise<() => Promise<void>> {
  return claimDataDir();
}
