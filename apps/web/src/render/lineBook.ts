import type { MemberId } from '../guild.config';

/**
 * What the members say over their heads at the moments of a scene, and now and then when they
 * start waiting on someone (Issue #47, docs/DESIGN.md 4.11). Fixed lines only: no title, label or branch name from a snapshot ever reaches a bubble,
 * and the types keep it so (a bubble takes a SpokenLine, a union of these literals). Hiragana and
 * katakana with a few signs, at most 7 characters (lines.test.ts checks every one); no names, so
 * renaming a member in guild.settings.ts never puts a wrong name in someone's mouth. Nothing that
 * reads as a fact about the company (its accounts, its posts).
 */

/** The moments of a scene someone speaks at. */
export type LineScene =
  /** かなめ hands the scroll over beside the member's desk. */
  | 'handOver'
  /** かなめ lets the tossed scroll go. */
  | 'toss'
  /** The scroll is in their hands: a member at the desk, or かなめ alone at the reception. */
  | 'takeScroll'
  /** A member hands the chest over at the counter. */
  | 'deliverChest'
  /** かなめ holds the chest up: handed over, or alone at the reception. */
  | 'takeChest'
  /** Confetti over the member whose quest was cleared. */
  | 'clear'
  /** The king, after the member's line on a clear. */
  | 'seeClear'
  /** Now waiting for the president's approval (remarks.ts: now and then, at the seat). */
  | 'awaitPresident'
  /** Now waiting for かなめ's review; for かなめ, now with pull requests to review. */
  | 'awaitKaname'
  /** Now waiting for a permission in the session. */
  | 'awaitPermission';

/** At least one line for each moment a member has. */
type Choices = readonly [string, ...string[]];

export const LINE_BOOK = {
  kaname: {
    handOver: ['クエストです！', 'おねがいします', 'たのみますね', 'はい、どうぞ'],
    toss: ['それっ！', 'パスです！', 'うけとって！'],
    takeScroll: ['うけつけました', 'おあずかり！', 'きろく、よし'],
    takeChest: ['おつかれさま！', 'たしかに！', 'おみごとです', 'うけとりました'],
    clear: ['かんりょうです', 'やりましたね', 'クリアです！'],
    awaitKaname: ['かくにんします', 'みておきますね', 'チェックします'],
    awaitPermission: ['よろしいですか', 'ごかくにんを！', 'きょかを…'],
  },
  minori: {
    takeScroll: ['うけたまわり！', 'けいさんします', 'はい、きっちり', 'おまかせを'],
    deliverChest: ['できました！', 'そろいました', 'ぴったりです'],
    clear: ['かんりょう！', 'すっきり！', 'やりました！'],
    awaitPresident: ['ごしょうにんを', 'はんこください', 'おねがいします'],
    awaitKaname: ['みてください', 'かくにんを…', 'どうでしょう？'],
    awaitPermission: ['よいですか？', 'きょか、まだ？', 'おうかがいを'],
  },
  hibiki: {
    takeScroll: ['まかせて！', 'きたきた！', 'いくよー！', 'よっしゃ！'],
    deliverChest: ['できたよ！', 'とどけ〜！', 'じしんさく！', 'みてみて！'],
    clear: ['やったー！', 'さいこう！', 'イェーイ！'],
    awaitPresident: ['おうさま〜！', 'みてほしいな', 'しょうにん！'],
    awaitKaname: ['みてみて〜', 'どうかな？', 'おねがい！'],
    awaitPermission: ['いい？いい？', 'まだかな〜', 'ゴーサイン？'],
  },
  hirame: {
    takeScroll: ['おもしろそう', 'かんがえます', 'ふむ、なるほど', 'いいですね'],
    deliverChest: ['かたちに！', 'できたかも！', 'あんです！', 'どうぞ…！'],
    clear: ['やった…！', 'よそうどおり', 'うまくいった', 'つぎは〜'],
    awaitPresident: ['おうさま、ぜひ', 'ごはんだんを', 'どうでしょう'],
    awaitKaname: ['みてもらお', 'どきどき…', 'いかがかな'],
    awaitPermission: ['いいのかな…', 'すすめても？', 'うーん、まつ'],
  },
  sasae: {
    takeScroll: ['まかせてね', 'しょうちです', 'やっておくね', 'はーい'],
    deliverChest: ['ととのえたよ', 'おまたせ', 'できました'],
    clear: ['ひとあんしん', 'よかったね', 'おつかれさま', 'ほっとした'],
    awaitPresident: ['ごさいけつを', 'おねがいね', 'みてくださいね'],
    awaitKaname: ['みておいてね', 'たしかめてね', 'おねがいします'],
    awaitPermission: ['いいかしら？', 'まってますね', 'どうかしら？'],
  },
  yukihiro: {
    seeClear: ['みごとじゃ！', 'あっぱれ！', 'ほめてつかわす'],
  },
} as const satisfies Readonly<Record<MemberId, Readonly<Partial<Record<LineScene, Choices>>>>>;

type Book = typeof LINE_BOOK;
type LinesOf<M extends MemberId> = {
  [S in keyof Book[M]]: Book[M][S] extends readonly (infer L)[] ? L : never;
}[keyof Book[M]];

/** Any line in the book: the only strings a member's line bubble takes. */
export type SpokenLine = { [M in MemberId]: LinesOf<M> }[MemberId];

const BOOK: Readonly<
  Record<MemberId, Readonly<Partial<Record<LineScene, readonly SpokenLine[]>>>>
> = LINE_BOOK;

/** The lines a member may say at a moment; none when they say nothing there. */
export function linesOf(id: MemberId, scene: LineScene): readonly SpokenLine[] {
  return BOOK[id][scene] ?? [];
}
