# conect-guild 設計書（v0.1）

日付: 2026-10-12
状態: 社長が承認（2026-10-12。推奨案をすべて採用。メンバーに名前を付けるリクエストあり）
ライセンス: MIT（OSS）

## 1. 何を作るか

conect.llc の「AI だけで動く会社」（司令塔かなめ 1 + 部門セッション 4 + 社長）を、レトロ RPG のギルド画面として眺めるアプリ。目標の見た目は codex に描かせたコンセプト画（`assets/concept/rpg-company-ui.png`）。

見立て:

| 会社 | ゲーム |
|---|---|
| GitHub Issue（部門ラベル付き） | クエスト（掲示板の巻物） |
| 部門セッション（経理・広報・企画・総務） | パーティのメンバー |
| かなめ（司令塔） | ギルドの受付。巻物を手渡す |
| 社長 | 玉座の王。承認待ちは「承認まち」の吹き出し |
| PR | 宝箱（成果物）。マージで経験値 |
| Issue のクローズ | 「クエストをクリアした！」のメッセージ |

作らないもの（v0.1 の範囲外）: 会話の中身の表示、セッションへの操作（指示を送るなど）、公開ホスティング。

### メンバーの名前

部門にはかなめと同じように名前を付ける（社長のリクエスト、2026-10-12）。名前は `guild.config.ts` の「部門 → 表示名」の対応表に置き、後から変えられるようにする。候補（社長の確認待ち）:

| 部門 | 名前（案） | 由来 |
|---|---|---|
| 司令塔 | かなめ | 扇の要（社長が命名済み） |
| 経理 | みのり | 実り。お金と成果を数える |
| 広報 | ひびき | 響き。声を外に届ける |
| 企画 | ひらめ | 閃き。案を生む |
| 総務 | ささえ | 支え。会社を下から支える |
| 社長 | ゆきひろ | 王様。社長が命名（2026-10-12） |

GitHub 上の部門ラベル（`経理` など）とは対応表で結び、Issue やコメントの書式は変えない。

## 2. 設計の原則

1. **TypeScript だけ。** フロントも収集スクリプトも TS。`any` と unsafe cast は使わない（`~/.claude/rules/code-quality.md`）
2. **依存は最小限。** 本体の実行時依存は Vue と zod（外部入力の検証。型は schema から推論する）の 2 つだけ。Canvas はブラウザ標準の機能なので追加なし。PixiJS などの描画ライブラリは入れない
3. **ブラウザから外部へ通信しない。** GitHub API はブラウザから呼ばず、ローカルの収集スクリプトが `gh` CLI で取って JSON に落とす。ブラウザはその JSON を読むだけ。トークンをフロントに置かない（`gh` の認証をそのまま使う）
4. **待ち受けを増やさない。** 立てるサーバーは Vite の開発サーバーだけ（既定で localhost）。独自の HTTP/WS サーバーは作らない。安全性調査（2026-10-12）で pixtuoid がいちばん安全だった理由と同じ
5. **会話の中身に触れない。** 読むのは Issue・PR の番号・題名・ラベル・状態・日時だけ。将来 hooks を使うときも、ツールの入力（`tool_input`）は捨て、イベント名とセッションの対応だけを残す
6. **ロジックは純粋関数に。** Issue → クエスト、状態の導出、経験値の計算は副作用のない関数にして vitest で守る。UI（Vue / Canvas）には判定を書かない
7. **公開しない前提の表示。** Issue の題名には取引先の名前が入るので、画面は手元で見るもの。GitHub Pages などに載せない（載せるときはダミーデータに限る）

## 3. 構成

```
conect-guild/
├── apps/web/                 Vue 3 + Vite + TS（画面）
│   └── src/
│       ├── guild.config.ts   部門 → 名前・色・席の位置
│       ├── domain/           純粋関数。型とロジック。テストの主戦場
│       │   ├── quest.ts      Issue → Quest（部門ラベル → 担当メンバー）
│       │   ├── party.ts      メンバーの状態（idle / working / waiting / done）の導出
│       │   ├── reward.ts     PR → 宝箱、経験値・レベル
│       │   └── events.ts     スナップショットの差分 → ゲームのイベント列（出発・帰還・クリア）
│       ├── adapters/
│       │   └── snapshot.ts   public/snapshot.json を fetch して zod で検証
│       ├── render/           Canvas。タイルマップ、スプライト、歩行、吹き出し、requestAnimationFrame
│       ├── ui/               Vue 部品: QuestBoard / PartyStatus / MessageWindow（Canvas の上に重ねる HTML）
│       └── app/              Vue の reactive による小さなストア。Pinia は入れない
├── packages/collector/       収集スクリプト（TS）。`gh api` で Issue・PR を取り、snapshot.json を書く
├── assets/                   コンセプト画、スプライト、タイル（出所とライセンスを README に書く）
├── docs/DESIGN.md            この文書
├── LICENSE                   MIT
└── .github/workflows/ci.yml  lint / typecheck / test
```

画面の重ね方: 一番下に Canvas（社屋とキャラ）、その上に Vue の窓（掲示板・パーティ・メッセージ）。文字は HTML で出すので日本語がきれいに出る。

## 4. データの流れ

```
GitHub (conect-management の Issue / PR)
   │  gh api（ローカル。gh の認証を使う。ブラウザは触らない）
   ▼
packages/collector  ──書く──▶  apps/web/public/snapshot.json
                                          │  fetch（同一オリジン）
                                          ▼
                              domain: 検証 → Quest / Party / Reward / Events
                                          ▼
                              render（Canvas） + ui（Vue）
```

- `snapshot.json` の中身: 取得時刻、Issue の配列（番号・題名・ラベル・状態・作成/更新/クローズ日時・担当）、PR の配列（番号・題名・状態・マージ日時・ブランチ名）。本文とコメントは取らない
- 収集の間隔: 既定 60 秒（`gh` のレート制限に十分収まる）。手動の 1 回実行もできる
- 差分 → イベント: 前回と今回のスナップショットを比べ、「Issue が新しく開いた → かなめが巻物を渡し、担当が出発」「PR がマージ → 担当が宝箱を持って帰還、経験値」「Issue がクローズ → メッセージ窓に『クリアした！』」を出す。前回のスナップショットはブラウザの `localStorage` に置く（差分のためだけ。無くても動く）

### 状態の導出（domain/party.ts）

| メンバーの状態 | 条件（GitHub だけで分かる範囲） |
|---|---|
| working | 自分のラベルの open Issue がある |
| waiting | 自分のブランチの open PR があり、ルール変更（CLAUDE.md など）を含む → 社長の「承認まち」。それ以外の open PR はかなめの確認待ち |
| done | 直近 N 分（既定 30 分）に自分の Issue がクローズされた |
| idle | 上のどれでもない |

経験値 = マージされた PR の数、レベルは一定の数ごとに上がる（式は domain/reward.ts に閉じ込め、テストで固定）。

## 5. 段階（小さく出して育てる）

| 段階 | できること | 中身 |
|---|---|---|
| M0 | 雛形 | `npm create vite`（vue-ts）、LICENSE、この設計書、ESLint（sonarjs）・Prettier・vitest・CI。依存の公開日（7 日ルール）を確かめて lockfile をコミット |
| M1 | 静止画 + 生データ | コンセプト画を背景にし、Vue の窓（掲示板・パーティ・メッセージ）に collector の snapshot.json の本物の値を出す。domain のテストもここで |
| M2 | Canvas の社屋 | タイルとスプライトで社屋を描き直す。5 人が席に座る。イベントで歩く（出発・帰還）、吹き出し、紙吹雪 |
| M3 | リアルタイム | Claude Code の hooks で「今まさに作業中 / 許可待ち」を拾う。hooks は `~/.conect-guild/events.jsonl`（0600）に 1 行追記するだけ。collector が読み、snapshot に混ぜる。`tool_input` は保存しない。**5 セッションの `~/.claude/settings.json` を触るので、着手前に社長の承認を改めて取る** |
| M4 | 遊び | 効果音、昼夜、レベルアップの演出、ネコ |

M1 まで行けば「本物の Issue が掲示板に出て、クローズでクリアのメッセージが出る」ところまで見られる。

## 6. 依存の方針（具体）

- 実行時: `vue`、`zod`
- 開発時: `vite`、`typescript`、`vue-tsc`、`vitest`、`eslint` + `eslint-plugin-vue` + `eslint-plugin-sonarjs` + `typescript-eslint`、`prettier`。E2E は M2 以降に `@playwright/test`
- 入れ方: `npm install` で npm に版を決めさせる。公開から 7 日未満の版は入れない（`npm view <pkg> time --json` で確認）。lockfile をコミット。追加・更新のたびに `npm outdated` と `npm audit` を見て報告
- 避けるもの: `postinstall` でスクリプトが走るもの、メンテナが 1 人で更新が止まっているもの、描画ライブラリ（最初は不要）
- 収集スクリプトの実行: Node の TypeScript 直接実行（Mac mini は Node v26.10、2026-10-12 確認）。`tsx` などの実行ランタイムは入れない

## 7. 絵の素材

- コンセプト画（codex 生成、`assets/concept/`）: 背景（M1）と目標の見た目として使う。生成の指示書も同じ場所に置く
- タイル（床・壁・机・本棚）: CC0 のタイルセット（Kenney など）を使う。出所とライセンスを `assets/README.md` に書く
- 6 体（かなめ・みのり・ひびき・ひらめ・ささえ・ゆきひろ）のスプライト: codex に「同じキャラの正面・横・歩き 2 コマ」を生成させ、手で整える。生成の指示書もリポジトリに残す
- 実在のゲームの素材・ロゴは使わない

## 8. テストと CI

- domain は vitest で全関数をカバー（Issue → Quest の対応、状態の導出、差分 → イベント、経験値）。時刻と乱数は注入できるようにする
- adapters の検証は、壊れた JSON を食わせて落ちないことを確かめる
- ESLint（sonarjs の複雑度・ネスト・引数）をエラー、`max-lines` 400 / `max-lines-per-function` 60 を warning で入れる
- `npm run verify` = lint + typecheck + test。CI は push と PR で回す

## 9. 決めたこと（2026-10-12）

1. zod を入れる（実行時の依存は Vue と zod の 2 つ）
2. 置き場所は `~/my-apps/conect-guild`。`~/.claude/repos.md` に行を足す
3. タイルは CC0 素材、キャラ 6 体は codex 生成
4. M3 の hooks は、着手前に改めて承認を取る
5. メンバーに名前を付ける（上の表。社長は「ゆきひろ」で確定。部門の 4 名は社長の確認待ち）

## 10. 作り方の体制

- リポジトリ `conect-guild` を作業ディレクトリにしたセッションで作る。このリポジトリの `CLAUDE.md` に上の原則（依存・通信・データ）を書き、作るセッションに読ませる
- 段階ごとに Issue を切って PR にする（M0 から）。main に直接 push しない
- 参考にしてよい OSS（すべて MIT）: pixel-agents（イベントの設計、hooks の受け方）、pixtuoid（ソケットと 0600 の扱い）。コードの丸写しはせず、仕組みを参考にする
