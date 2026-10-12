import { describe, expect, it } from 'vitest';
import { linesOf, type SpokenLine } from './lineBook';
import {
  createLinePicker,
  linesAt,
  pickLine,
  remember,
  showMs,
  speakInTurn,
  type PickLine,
  type Turn,
  type Utterance,
} from './lines';
import { LINES } from './metrics';

/** A small repeatable generator (mulberry32) for long runs. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('pickLine', () => {
  const options = ['a', 'b', 'c', 'd'] as const;

  it('chooses evenly by the random number, first to last', () => {
    expect(pickLine(options, [], () => 0)).toBe('a');
    expect(pickLine(options, [], () => 0.25)).toBe('b');
    expect(pickLine(options, [], () => 0.74)).toBe('c');
    expect(pickLine(options, [], () => 0.9999)).toBe('d');
  });

  it('never goes past the last option, even for a random number of 1', () => {
    expect(pickLine(options, [], () => 1)).toBe('d');
  });

  it('avoids the last LINES.recentLines lines said', () => {
    expect(LINES.recentLines).toBe(2);
    expect(pickLine(options, ['c', 'a'], () => 0)).toBe('b');
    expect(pickLine(options, ['c', 'a'], () => 0.9999)).toBe('d');
    // Only the last two count: 'd' said three lines ago may come again.
    expect(pickLine(options, ['d', 'c', 'a'], () => 0.9999)).toBe('d');
  });

  it('leaves one line to say when there are fewer: two options avoid only the last', () => {
    expect(pickLine(['x', 'y'], ['y', 'x'], () => 0)).toBe('y');
    expect(pickLine(['x', 'y'], ['x', 'y'], () => 0.9999)).toBe('x');
  });

  it('says the only option every time', () => {
    expect(pickLine(['x'], ['x', 'x'], () => 0.5)).toBe('x');
  });

  it('says nothing without options', () => {
    expect(pickLine([], [], () => 0.5)).toBeNull();
  });

  it('ignores remembered lines that are not among the options', () => {
    expect(pickLine(['x', 'y', 'z'], ['q', 'r'], () => 0)).toBe('x');
  });
});

describe('remember', () => {
  it('keeps the last LINES.recentLines lines, oldest first', () => {
    expect(remember([], 'a')).toEqual(['a']);
    expect(remember(['a'], 'b')).toEqual(['a', 'b']);
    expect(remember(['a', 'b'], 'c')).toEqual(['b', 'c']);
  });

  it('does not change the list it was given', () => {
    const recent = ['a', 'b'] as const;
    remember(recent, 'c');
    expect(recent).toEqual(['a', 'b']);
  });
});

describe('createLinePicker', () => {
  it('picks the same lines from the same random sequence', () => {
    const a = createLinePicker(seeded(7));
    const b = createLinePicker(seeded(7));
    const said = (pick: PickLine) =>
      Array.from({ length: 12 }, () => [pick('hibiki', 'clear'), pick('kaname', 'toss')]);
    expect(said(a)).toEqual(said(b));
  });

  it('never says a line again while it is among the last ones of that member and moment', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const pick = createLinePicker(seeded(seed));
      const said = Array.from({ length: 60 }, () => pick('kaname', 'handOver'));
      for (let i = 1; i < said.length; i += 1) {
        const window = said.slice(Math.max(0, i - LINES.recentLines), i);
        expect(window).not.toContain(said[i]);
      }
    }
  });

  it('says every line of a moment over time', () => {
    const pick = createLinePicker(seeded(11));
    const said = new Set(Array.from({ length: 40 }, () => pick('hirame', 'takeScroll')));
    expect(said).toEqual(new Set(linesOf('hirame', 'takeScroll')));
  });

  it('remembers each member and moment apart', () => {
    // Always the first fresh line: the memory of one moment never steers another.
    const pick = createLinePicker(() => 0);
    const first = linesOf('minori', 'clear')[0];
    expect(pick('minori', 'clear')).toBe(first);
    expect(pick('minori', 'takeScroll')).toBe(linesOf('minori', 'takeScroll')[0]);
    expect(pick('hibiki', 'clear')).toBe(linesOf('hibiki', 'clear')[0]);
    expect(pick('minori', 'clear')).toBe(linesOf('minori', 'clear')[1]);
  });

  it('says nothing (and draws no number) at a moment the member has no lines for', () => {
    let draws = 0;
    const pick = createLinePicker(() => {
      draws += 1;
      return 0;
    });
    expect(pick('yukihiro', 'handOver')).toBeNull();
    expect(draws).toBe(0);
  });
});

const say =
  (line: SpokenLine): PickLine =>
  () =>
    line;

describe('speakInTurn', () => {
  const giveAndTake: Turn[] = [
    { actor: 'kaname', scene: 'handOver', at: 1_000 },
    { actor: 'minori', scene: 'takeScroll', at: 3_100 },
  ];

  it('says nothing without a picker (the message queue only times scenes)', () => {
    expect(speakInTurn(giveAndTake, [], undefined)).toEqual([]);
  });

  it('shows each line from its time for as long as its moment says', () => {
    const lines = speakInTurn(giveAndTake, [], say('はい、どうぞ'));
    expect(lines).toEqual([
      { actor: 'kaname', line: 'はい、どうぞ', start: 1_000, end: 1_000 + LINES.giveMs },
      { actor: 'minori', line: 'はい、どうぞ', start: 3_100, end: 3_100 + LINES.takeMs },
    ]);
  });

  it('lets the next speaker wait until the line before is over', () => {
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'toss', at: 0 },
      { actor: 'hibiki', scene: 'takeScroll', at: 900 },
    ];
    const [toss, take] = speakInTurn(turns, [], say('それっ！'));
    expect(toss?.end).toBe(LINES.tossMs);
    expect(take?.start).toBe(LINES.tossMs);
  });

  it('starts right as the one before ends: the two never show together', () => {
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'handOver', at: 0 },
      { actor: 'sasae', scene: 'takeScroll', at: LINES.giveMs },
    ];
    const [a, b] = speakInTurn(turns, [], say('はーい'));
    expect(b?.start).toBe(a?.end);
  });
});

describe('speakInTurn: a member who still speaks', () => {
  const giveAndTake: Turn[] = [
    { actor: 'kaname', scene: 'handOver', at: 1_000 },
    { actor: 'minori', scene: 'takeScroll', at: 3_100 },
  ];

  it('drops a turn whose member still says a line of another scene, and does not pick for it', () => {
    const said: Utterance[] = [{ actor: 'minori', line: 'かんりょう！', start: 2_000, end: 3_200 }];
    const asked: string[] = [];
    const pick: PickLine = (actor) => {
      asked.push(actor);
      return 'はい、どうぞ';
    };
    const lines = speakInTurn(giveAndTake, said, pick);
    expect(lines.map((l) => l.actor)).toEqual(['kaname']);
    expect(asked).toEqual(['kaname']);
  });

  it('keeps a turn that starts right as the other line ends (end is exclusive)', () => {
    const said: Utterance[] = [{ actor: 'minori', line: 'かんりょう！', start: 1_000, end: 3_100 }];
    const lines = speakInTurn(giveAndTake, said, say('はい、どうぞ'));
    expect(lines.map((l) => l.actor)).toEqual(['kaname', 'minori']);
  });

  it('keeps a turn whose other member is the one still speaking', () => {
    const said: Utterance[] = [{ actor: 'hibiki', line: 'やったー！', start: 0, end: 9_000 }];
    expect(speakInTurn(giveAndTake, said, say('はーい'))).toHaveLength(2);
  });

  it('skips a turn nobody picks a line for; the next keeps its own time', () => {
    const pick: PickLine = (actor) => (actor === 'kaname' ? null : 'おまかせを');
    const turns: Turn[] = [
      { actor: 'kaname', scene: 'toss', at: 0 },
      { actor: 'minori', scene: 'takeScroll', at: 900 },
    ];
    expect(speakInTurn(turns, [], pick)).toEqual([
      { actor: 'minori', line: 'おまかせを', start: 900, end: 900 + LINES.takeMs },
    ]);
  });
});

describe('showMs', () => {
  it('keeps every line on screen 1.2 to 2.0 s', () => {
    const scenes = [
      'handOver',
      'toss',
      'takeScroll',
      'deliverChest',
      'takeChest',
      'clear',
      'seeClear',
    ] as const;
    for (const scene of scenes) {
      expect(showMs(scene)).toBeGreaterThanOrEqual(1_200);
      expect(showMs(scene)).toBeLessThanOrEqual(2_000);
    }
  });
});

describe('linesAt', () => {
  const lines: Utterance[] = [
    { actor: 'kaname', line: 'それっ！', start: 100, end: 200 },
    { actor: 'hibiki', line: 'まかせて！', start: 200, end: 300 },
  ];

  it('shows a line from its start up to (not at) its end', () => {
    expect(linesAt(lines, 99)).toEqual({});
    expect(linesAt(lines, 100)).toEqual({ kaname: 'それっ！' });
    expect(linesAt(lines, 199)).toEqual({ kaname: 'それっ！' });
    expect(linesAt(lines, 200)).toEqual({ hibiki: 'まかせて！' });
    expect(linesAt(lines, 300)).toEqual({});
  });
});
