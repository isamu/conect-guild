/**
 * The script of the demo mode (Issue #49): what happens when in one loop, as a list of beats.
 * Everything here is fictional; no title or name comes from real data. To show something new in
 * the demo (the king's call of #28, levels of #19), add a beat (and its action in domain/demo.ts).
 */

/** One loop of the demo; it then starts over with new quest numbers. */
export const DEMO_LOOP_MS = 60_000;

/** A fictional repository: the demo never reads or names the real one. */
export const DEMO_REPO = 'demo-guild/demo-company';

/**
 * Who a beat is about. Each loop gives the four lanes to the four departments: two of them carry a
 * quest from opening to clearing (quest1 sits near かなめ, quest2 farther and needs the president),
 * the other two only work in their sessions. The pairs swap every loop (domain/demo.ts
 * laneDepartments), so all four departments carry a quest every two loops.
 */
export const DEMO_LANES = ['quest1', 'quest2', 'helper1', 'helper2'] as const;
export type DemoLane = (typeof DEMO_LANES)[number];

/**
 * What a beat does to its lane. open-issue: かなめ hands over the scroll. work / ask / rest: the
 * department's session is working / awaiting permission (「？」) / resting. open-pr: a PR waits for
 * かなめ's review. open-rule-pr: a PR that changes rules waits for the president (承認まち).
 * merge-pr: the chest is delivered to かなめ. close-issue: 「クリアした！」 and confetti.
 */
export type DemoAction =
  | 'open-issue'
  | 'work'
  | 'ask'
  | 'rest'
  | 'open-pr'
  | 'open-rule-pr'
  | 'merge-pr'
  | 'close-issue';

export interface DemoBeat {
  /** Ms from the start of the loop. */
  readonly at: number;
  readonly lane: DemoLane;
  readonly action: DemoAction;
}

/**
 * One loop, in time order. The gaps follow the scenes the beats start (render/scenes.ts): handing
 * over a scroll keeps かなめ about 8.5 s, delivering a chest about 12.5 s, and a message stays at
 * least 8 s (app/guildStore.ts), so each event reaches the window as かなめ becomes free.
 */
export const DEMO_SCRIPT: readonly DemoBeat[] = [
  { at: 1_500, lane: 'quest1', action: 'open-issue' },
  { at: 4_000, lane: 'helper1', action: 'work' },
  { at: 10_500, lane: 'quest2', action: 'open-issue' },
  { at: 13_500, lane: 'quest1', action: 'work' },
  { at: 16_000, lane: 'quest1', action: 'ask' },
  { at: 18_000, lane: 'quest1', action: 'work' },
  { at: 18_000, lane: 'helper1', action: 'rest' },
  { at: 20_000, lane: 'quest1', action: 'open-pr' },
  { at: 20_000, lane: 'quest1', action: 'rest' },
  { at: 22_500, lane: 'quest2', action: 'work' },
  { at: 24_000, lane: 'quest1', action: 'merge-pr' },
  { at: 26_000, lane: 'helper2', action: 'work' },
  { at: 29_000, lane: 'quest2', action: 'open-rule-pr' },
  { at: 29_000, lane: 'quest2', action: 'rest' },
  { at: 38_000, lane: 'quest1', action: 'close-issue' },
  { at: 44_000, lane: 'helper2', action: 'rest' },
  { at: 47_000, lane: 'quest2', action: 'merge-pr' },
  { at: 55_000, lane: 'quest2', action: 'close-issue' },
];

/** A quest of the demo: the Issue's title and the title of the PR that finishes it. */
export interface DemoQuestTitles {
  readonly issue: string;
  readonly pr: string;
}

/**
 * Fictional quests per department, in the order of guild.settings.ts (経理, 広報, 企画, 総務).
 * Plain everyday work: no client, product or real project names.
 */
export const DEMO_TITLES: readonly (readonly DemoQuestTitles[])[] = [
  [
    { issue: '10 月分の請求書を作る', pr: '請求書の下書き' },
    { issue: '経費の領収書を整理する', pr: '領収書の一覧' },
    { issue: '冬の賞与の試算をする', pr: '賞与の試算表' },
  ],
  [
    { issue: '秋の講座の告知文を書く', pr: '告知文の原稿' },
    { issue: 'お知らせのメールを送る', pr: 'メールの文面' },
    { issue: '新しいチラシを作る', pr: 'チラシの原稿' },
  ],
  [
    { issue: '新サービスの市場を調べる', pr: '市場調査のまとめ' },
    { issue: '冬のイベント案を練る', pr: 'イベント案のまとめ' },
    { issue: '勉強会の企画書を書く', pr: '企画書の下書き' },
  ],
  [
    { issue: '備品の棚卸しをする', pr: '棚卸しの結果' },
    { issue: '会議室の予約表を作る', pr: '予約表のひな形' },
    { issue: '防災用品を点検する', pr: '点検の記録' },
  ],
];
