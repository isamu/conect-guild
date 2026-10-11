import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompanySeat } from '../collector.config.ts';
import {
  MAX_ACTIVITY_STATE_BYTES,
  MAX_CWD_LOG_BYTES,
  readCompanySessions,
  type SessionFilePaths,
} from './sessionFiles.ts';

const KANAME = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000f';
const OTHER_PATH = '/home/u/secret-client-project';

let dir = '';
let paths: SessionFilePaths;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'guild-sessions-'));
  const root = join(dir, 'conect-management');
  const seats: CompanySeat[] = [
    { department: null, cwd: root },
    { department: '経理', cwd: join(root, 'accounting') },
  ];
  paths = {
    seats,
    cwdLogPath: join(dir, 'dev-terminal-cwds.json'),
    activityStatePath: join(dir, 'activity-state.json'),
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeCwdLog(...lines: string[]): Promise<void> {
  // MulmoTerminal appends each record with the newline in front.
  await writeFile(paths.cwdLogPath, lines.map((line) => `\n${line}`).join(''));
}

describe('readCompanySessions', () => {
  it('reads both files and returns the seats only', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    await writeCwdLog(`${OTHER} ${OTHER_PATH}`, `${KANAME} ${root}`);
    await writeFile(
      paths.activityStatePath,
      JSON.stringify({
        [OTHER]: { working: true, waiting: false, event: 'PreToolUse' },
        [KANAME]: { working: false, waiting: true, event: 'Notification' },
      }),
    );
    const result = await readCompanySessions(paths);
    expect(result).toEqual({
      ok: true,
      found: 1,
      members: [
        { department: null, state: 'awaiting-permission' },
        { department: '経理', state: 'idle' },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${OTHER}|${OTHER_PATH}|${dir}`));
  });

  it('reads a large log line by line', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    const others = Array.from({ length: 20_000 }, (_, i) => `${OTHER} ${OTHER_PATH}/${String(i)}`);
    await writeCwdLog(...others, `${KANAME} ${root}`);
    await writeFile(paths.activityStatePath, '{}');
    await expect(readCompanySessions(paths)).resolves.toMatchObject({ ok: true, found: 1 });
  });
});

describe('readCompanySessions: failures', () => {
  it('is missing when the cwd log does not exist', async () => {
    await writeFile(paths.activityStatePath, '{}');
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'missing' });
  });

  it('is missing when the activity file does not exist', async () => {
    await writeCwdLog();
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'missing' });
  });

  it('is read-failed when a path is a directory', async () => {
    await writeFile(paths.cwdLogPath, '');
    await expect(readCompanySessions({ ...paths, activityStatePath: dir })).resolves.toEqual({
      ok: false,
      kind: 'read-failed',
    });
  });

  it('is too-large when the cwd log passes its limit', async () => {
    await writeFile(paths.cwdLogPath, Buffer.alloc(MAX_CWD_LOG_BYTES + 1, 0x61));
    await writeFile(paths.activityStatePath, '{}');
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'too-large' });
  });

  it('is too-large when the activity file passes its limit, and reads it at the limit', async () => {
    await writeCwdLog();
    await writeFile(paths.activityStatePath, `{}${' '.repeat(MAX_ACTIVITY_STATE_BYTES - 2)}`);
    await expect(readCompanySessions(paths)).resolves.toMatchObject({ ok: true });
    await writeFile(paths.activityStatePath, `{}${' '.repeat(MAX_ACTIVITY_STATE_BYTES - 1)}`);
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'too-large' });
  });

  it.each([
    ['empty', ''],
    ['half written', '{"a":'],
  ])('is parse-failed when the activity file is %s', async (_label, text) => {
    await writeCwdLog();
    await writeFile(paths.activityStatePath, text);
    await expect(readCompanySessions(paths)).resolves.toEqual({
      ok: false,
      kind: 'parse-failed',
    });
  });

  it('leaves both files untouched', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    await writeCwdLog(`${KANAME} ${root}`);
    await writeFile(paths.activityStatePath, '{}');
    const before = await Promise.all([
      stat(paths.cwdLogPath),
      stat(paths.activityStatePath),
      readFile(paths.cwdLogPath, 'utf8'),
    ]);
    await readCompanySessions(paths);
    const after = await Promise.all([
      stat(paths.cwdLogPath),
      stat(paths.activityStatePath),
      readFile(paths.cwdLogPath, 'utf8'),
    ]);
    expect(after[0].mtimeMs).toBe(before[0].mtimeMs);
    expect(after[1].mtimeMs).toBe(before[1].mtimeMs);
    expect(after[2]).toBe(before[2]);
  });
});
