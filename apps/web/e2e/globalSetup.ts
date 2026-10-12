import { claimDataDir } from './snapshotFile.ts';

export default async function globalSetup(): Promise<void> {
  await claimDataDir();
}
