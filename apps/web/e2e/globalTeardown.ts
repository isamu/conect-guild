import { releaseDataDir } from './snapshotFile.ts';

export default async function globalTeardown(): Promise<void> {
  await releaseDataDir();
}
