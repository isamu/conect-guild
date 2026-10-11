# conect-guild 設計書（v0.2）

日付: 2026-10-12
状態: v0.2。社長承認済み。codex レビュー 1 周目を反映
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
| PR | 宝箱（成果物）。マージで「最近の成果」に加わる |
| Issue のクローズ | 「クエストをクリアした！」のメッセージ |

作らないもの（v0.2 の範囲外）: 会話の中身の表示、セッションへの操作（指示を送るなど）、公開ホスティング、ビルド成果物（`dist/`）の配布。

### メンバーの名前

部門にはかなめと同じように名前を付ける（社長のリクエスト、2026-10-12）。名前は `guild.config.ts` の「部門 → 表示名」の対応表に置き、後から変えられるようにする。社長が確定した名前（2026-10-12）:

| 部門 | 名前 | 由来 |
|---|---|---|
| 司令塔 | かなめ | 扇の要 |
| 経理 | みのり | 実り。お金と成果を数える |
| 広報 | ひびき | 響き。声を外に届ける |
| 企画 | ひらめ | 閃き。案を生む |
| 総務 | ささえ | 支え。会社を下から支える |
| 社長 | ゆきひろ | 王様 |

GitHub 上の部門ラベル（`経理` など）とは対応表で結び、Issue やコメントの書式は変えない。

## 2. 設計の原則

1. **TypeScript だけ。** フロントも収集スクリプトも TS。`any` と unsafe cast は使わない（`~/.claude/rules/code-quality.md`）
2. **依存は最小限。** 本体の実行時依存は Vue と zod（外部入力の検証。型は schema から推論する）の 2 つだけ。Canvas はブラウザ標準の機能なので追加なし。PixiJS などの描画ライブラリは入れない
3. **ブラウザから外部へ通信しない。** GitHub API はブラウザから呼ばず、ローカルの収集スクリプトが `gh` CLI で取って JSON に落とす。ブラウザはその JSON を読むだけ。トークンをフロントに置かない（`gh` の認証をそのまま使う）
4. **待ち受けを増やさない。** 立てるサーバーは Vite の開発サーバーだけで、`127.0.0.1` に固定する（`vite.config.ts` の `server.host`。`--host` は使わない）。独自の HTTP/WS サーバーは作らない。安全性調査（2026-10-12）で pixtuoid がいちばん安全だった理由と同じ
5. **会話の中身に触れない。** 読むのは Issue・PR の番号・題名・ラベル・状態・日時・ブランチ名と、open PR の変更ファイルのパスだけ。PR の題名と本文は対応 Issue の番号を拾うためだけに読み、本文は保存しない。将来 hooks を使うときも、ツールの入力（`tool_input`）は捨て、イベント名とセッションの対応だけを残す
6. **ロジックは純粋関数に。** Issue → クエスト、状態の導出、最近の成果の計算は副作用のない関数にして vitest で守る。UI（Vue / Canvas）には判定を書かない
7. **実データは配信物に入れない。** Issue の題名には取引先の名前が入るので、画面は手元で見るもの。実データは `apps/web/public/` に置かず、ビルドにも入れない（5 章の「公開範囲」）。GitHub Pages などに載せない
8. **外部の文字列は文字として描く。** Issue・PR の題名やラベルは外部入力なので、Vue のテキスト補間（`{{ }}`）か Canvas の `fillText` だけで描く。`v-html`、`innerHTML` などの HTML への直接挿入、外部 URL の画像・フォント・スクリプトの読み込みは使わない（画面にスクリプトを差し込まれると、手元の snapshot を外へ送られる）

## 3. 構成

```
conect-guild/
├── apps/web/                 Vue 3 + Vite + TS（画面）
│   ├── vite.config.ts        server.host を 127.0.0.1 に固定。snapshot 配信プラグインを登録
│   ├── vite-plugin-snapshot.ts  開発時だけの自作プラグイン。/snapshot.json を .data/ から返す
│   ├── .data/                実データの置き場（gitignore。Vite の配信対象外）
│   │   └── snapshot.json     collector が書く（0600）
│   ├── public/
│   │   └── snapshot.sample.json  ダミー（架空の題名）。build と CI はこれだけを使う
│   └── src/
│       ├── guild.config.ts   部門 → 名前・色・席の位置、ブランチ接頭辞 → 部門
│       ├── domain/           純粋関数。型とロジック。テストの主戦場
│       │   ├── quest.ts      Issue → Quest（部門ラベル → 担当メンバー）
│       │   ├── party.ts      メンバーの状態の導出（4 章の表）
│       │   ├── reward.ts     PR → 宝箱、最近の成果（累積の経験値・レベルは M4）
│       │   ├── baseline.ts   localStorage に置く基準状態の型と更新規則
│       │   └── events.ts     基準状態と今回の snapshot の差分 → ゲームのイベント列
│       ├── adapters/
│       │   ├── snapshot.ts   /snapshot.json を no-store で fetch して zod で検証
│       │   └── storage.ts    localStorage の読み書き（失敗しても例外を外に出さない）
│       ├── render/           Canvas（M2）。純粋な部分は vitest で守る
│       │   ├── metrics.ts    大きさの一元管理（タイル 32px、キャラのコマ 64px、論理解像度 1024×576）
│       │   ├── map.ts        32×18 マスの地図、家具、窓に隠れる範囲、歩けるマス
│       │   ├── path.ts       タイル ↔ 論理座標、通路の経路探索（BFS）
│       │   ├── scenes.ts     イベント → 演出の台本（受け渡し・宝箱・紙吹雪）
│       │   ├── director.ts   台本の再生（時刻を渡すと全員の位置とコマを返す）
│       │   ├── motion.ts / confetti.ts / bubbles.ts  歩行のコマ送り、紙吹雪の粒子（乱数を注入）、席の上の吹き出し
│       │   ├── art.ts        絵の差し替え境界（TileArt / SpriteArt）と仮の矩形
│       │   ├── tileArt.ts / spriteArt.ts / loadArt.ts  assets/ の絵で描く実装と読み込み
│       │   └── draw.ts / loop.ts  描画と requestAnimationFrame（動くものがある間だけ回す）
│       ├── ui/               Vue 部品: QuestBoard / PartyStatus / MessageWindow（Canvas の上に重ねる HTML）
│       └── app/              Vue の reactive による小さなストア。Pinia は入れない
├── packages/collector/       収集スクリプト（TS。Node の型除去で直接実行）
│   ├── collector.config.ts   対象リポジトリ（既定 yukihiroyamaguchi569/conect-management）、間隔
│   └── src/main.ts           `gh api` で Issue・PR を取り、検証して .data/snapshot.json を原子的に書く
├── assets/                   コンセプト画、スプライト、タイル（出所とライセンスを README に書く）
├── docs/DESIGN.md            この文書
├── LICENSE                   MIT
└── .github/workflows/ci.yml  npm ci → lint / typecheck / test / build（サンプルデータのみ）
```

画面の重ね方: 一番下に Canvas（社屋とキャラ）、その上に Vue の窓（掲示板・パーティ・メッセージ）。文字は HTML で出すので日本語がきれいに出る。

## 4. データの流れ

```
GitHub（collector.config.ts に固定したリポジトリの Issue / PR）
   │  gh api（execFile で引数配列。gh の認証を使う。ブラウザは触らない）
   ▼
packages/collector ──検証して一時ファイルに書き rename──▶ apps/web/.data/snapshot.json（0600、gitignore）
                                                              │  開発時だけ: Vite の自作プラグインが
                                                              │  GET /snapshot.json に Cache-Control: no-store で返す
                                                              ▼
                              画面: 30 秒ごとに fetch('/snapshot.json', { cache: 'no-store' })
                                                              ▼
                              domain: zod で検証 → Quest / Party / Reward / Events
                                                              ▼
                              ui（Vue） + render（Canvas、M2〜）
```

### 4.1 収集（packages/collector）

- **対象リポジトリ**: `collector.config.ts` に固定する（既定 `yukihiroyamaguchi569/conect-management`）。コマンドライン引数や環境変数では変えられない
- **`gh` の呼び方**: `child_process.execFile('gh', [引数の配列])`。シェル文字列は組まない。認証はユーザーの `gh` のものをそのまま使う
- **ページ送り**: `gh api --paginate --jq '<射影> | @json'` で、要るフィールドだけに絞った要素を 1 行 1 JSON で受け、行ごとに zod で検証する（`--slurp` は `--jq` と併用できない）。差分の中身や Issue の本文は gh の段階で落とす。ページが配列でなければ jq でエラーにし、空の一覧と取り違えない。`execFile` の `maxBuffer` は 64 MB にし、超えたら失敗として扱う。テストは複数ページの出力で行う
- **Issue**: 全ページ取る。open は全部、closed は直近 7 日（`since` で絞り、`closed_at` で確かめる）。GitHub の Issue 一覧には PR が混ざるので、`pull_request` キーを持つものは除く
- **PR**: open は全部、closed / merged は直近 7 日のもの。全ページ取る
- **PR と Issue の結び付け**: PR の題名と本文から、同じリポジトリを指す参照（`#番号` と `<対象リポジトリ>#番号`）を正規表現で拾い、`linkedIssues: number[]` として持つ。別リポジトリの参照（`owner/other#番号`）は拾わない。`Closes`・`Fixes`・`Resolves` の後の参照が 1 つでもあれば、それだけを使う。本文そのものは保存しない
- **変更ファイル**: open PR だけ、`gh api --paginate --jq` で `repos/<r>/pulls/<n>/files` の `filename` だけを取り、`changedFiles: string[]` として持つ（差分の中身は取らない）
- **間隔**: 既定 60 秒（`gh` のレート制限に十分収まる）。`--once` で 1 回だけ実行もできる
- **書き込み**: 取得した結果を zod で検証してから、同じディレクトリの一時ファイルに 0600 で書き、`rename` で `apps/web/.data/snapshot.json` を原子的に置き換える。画面が書きかけの JSON を読むことはない
- **失敗したとき**: 取得や検証に 1 つでも失敗したら snapshot を書き換えず、直前の正常なものを残す（空の配列で上書きしない）
- **ログ**: 出すのは件数・時刻・エラーの種類だけ。題名・本文・ブランチ名はログに出さない

### 4.2 snapshot.json の中身

```
{
  schemaVersion: 1,
  fetchedAt: ISO 8601,
  repo: "owner/name",
  issues: [{ number, title, labels: string[], state, createdAt, updatedAt, closedAt | null }],
  prs:    [{ number, title, state, mergedAt | null, closedAt | null, headRef,
             linkedIssues: number[], changedFiles: string[] }]   // changedFiles は open PR だけ。closed は []
}
```

本文とコメントは保存しない。

### 4.3 画面の取得と表示

- 画面は 30 秒ごとに `/snapshot.json` を `cache: 'no-store'` で fetch する。ネットワークエラーと HTTP エラーの両方を扱い、失敗したら前回の表示を残して小さく「取得失敗」と出す
- `schemaVersion` が画面の想定と違えば、表示を止めて「収集スクリプトを更新してください」と出す
- `fetchedAt` が 5 分より古ければ「情報が古い」の印を出す（collector が止まっている合図）
- 開発時だけ、Vite の自作プラグイン（`configureServer` のミドルウェア。依存なし）が `/snapshot.json` を `apps/web/.data/snapshot.json` から返す。ファイルが無ければ 404。`.data/` は `public/` の外なので、Vite の public 監視による再読み込みは起きない

### 4.4 差分 → イベント（domain/events.ts, domain/baseline.ts）

- 差分の基準はブラウザの `localStorage` に置く。保存するのは `{ schemaVersion, fetchedAt, issues: [{ number, state, closedAt }], prs: [{ number, state, mergedAt }] }` だけ。題名・ラベル・ブランチ名は保存しない
- **初回**（基準が無い、または `schemaVersion` が違う）は演出を出さず、基準だけ保存する
- **巻き戻さない**: 今回の `fetchedAt` が基準の `fetchedAt` 以前なら、イベントも基準の更新もしない
- **空白が長いとき**: 基準の `fetchedAt` が 7 日（収集の取得範囲）より古ければ、取りこぼしがありうるので演出を出さず、基準だけ置き換えてメッセージ窓に「この期間の出来事は復元できません」と出す
- **基準の更新**は、取得と検証に成功したときだけ行う。失敗した取得では基準を変えない
- **イベント**: 基準と今回を比べて、「Issue が新しく開いた → かなめが巻物を渡し、担当が出発」「PR がマージ → 担当が宝箱を持って帰還」「Issue がクローズ → メッセージ窓に『クリアした！』」を出す
- **基準に無いまま閉じたもの**: 取得の間に開いて閉じた Issue（基準に無く、今回 closed で `closedAt` が基準の `fetchedAt` より後）はクリアだけを出す。マージ済みで基準に無い PR も同じく帰還だけを出す
- **重複を出さない**: イベントは「種類 + 番号」（例: `issue-closed#123`）で識別し、同じ基準から同じイベントを二度出さない。イベントを出したあと、その取得の内容で基準を置き換える
- **localStorage が使えない**（例外、容量不足、プライベートモード）ときも表示は続け、演出だけ出さない

### 4.5 担当の決め方（domain/quest.ts, domain/party.ts）

- **Issue の担当**: 部門ラベル（`経理`・`広報`・`企画`・`総務`）で決める
  - 部門ラベルが 0 個 → 「かなめの受付（担当なし）」の巻物として受付に置く
  - 2 個以上 → 固定の順（経理 → 広報 → 企画 → 総務）で最初のものを担当にし、巻物に「複数部門」の印を付ける
- **PR の担当**: 次の順で決める
  1. `linkedIssues` のうち snapshot にある Issue の部門ラベル（複数あれば上と同じ固定の順）
  2. 結べなければ、ブランチ名の接頭辞の対応表（`guild.config.ts`）で推定
  3. それも無ければ「担当不明」として、かなめの受付に置く
- **PR の待ちの種類**（open PR だけ）
  - `changedFiles` のどれかがルール変更に当たる → 社長の承認まち（conect-management のルール変更は社長がマージするため）。照合は glob を使わず、次の 3 つの文字列比較で行う
    - パスが `CLAUDE.md` に等しい（ルートの CLAUDE.md）
    - パスが `/CLAUDE.md` で終わる（`accounting/CLAUDE.md`、`projects/CLAUDE.md` など）
    - パスが `.claude/agents/` で始まる
    - テスト例: `CLAUDE.md`・`pr/CLAUDE.md`・`.claude/agents/pr.md` は当たる。`CLAUDE.md.bak`・`docs/MYCLAUDE.md`・`x/.claude/agents/a.md` は当たらない
  - それ以外 → かなめの確認まち

### 4.6 状態の導出（domain/party.ts）

メンバーの状態は、上から順に最初に当たったもの（優先順位: 社長の承認まち > かなめの確認まち > working > done > idle）。

| 優先 | メンバーの状態 | 条件（GitHub だけで分かる範囲） |
|---|---|---|
| 1 | 社長の承認まち | 自分が担当の open PR のうち、ルール変更のファイルを含むものがある |
| 2 | かなめの確認まち | 自分が担当の open PR がある（1 に当たらないもの） |
| 3 | working | 自分が担当の open Issue がある |
| 4 | done | 直近 N 分（既定 30 分）に自分が担当の Issue がクローズされた |
| 5 | idle | 上のどれでもない |

判定に必要な値が欠けているとき（例: 対応表に無いラベルだけの Issue）は idle にし、理由をツールチップに出す。

「最近の成果」= 自分が担当の、直近 7 日にマージされた PR の数（domain/reward.ts。テストで固定）。取得範囲に合わせた値なので、時間がたつと減る。累積の経験値とレベルは全履歴の集計が要るので、M4 で別に設計する。

## 5. 公開範囲

- 実データ（`apps/web/.data/snapshot.json`）は Vite の `public/` に置かない。`.gitignore` で除き、パーミッションは 0600
- 実データを画面に出す経路は、開発サーバーの自作プラグインだけ。開発サーバーは `127.0.0.1` に固定し、`--host` や `server.host: true` を使わない（LAN に出さない）
- `vite build` と CI は `apps/web/public/snapshot.sample.json`（架空の題名のダミー）だけを使う。プラグインは開発時だけ有効なので、ビルドに実データは入らない
- `dist/` は配布しない（GitHub Pages などに載せない）
- localStorage には題名を残さない（4.4）
- 実データを消すときは `apps/web/.data/` を消し、ブラウザの localStorage の基準を消す（画面に「基準を消す」ボタンを置く）

## 6. 段階（小さく出して育てる）

| 段階 | できること | 中身 |
|---|---|---|
| M0 | 雛形 | `npm create vite`（vue-ts）、LICENSE、この設計書、ESLint（sonarjs）・Prettier・vitest・CI（`npm ci --ignore-scripts`）。7 章の手順で依存を入れて lockfile をコミット。`vite.config.ts` で `server.host: '127.0.0.1'`。collector の最小の雛形を置き、`node packages/collector/src/main.ts --once` が型除去で起動して設定を読み、GitHub に触れずに終わることを確かめる（実際の収集は M1）。collector の型検査も verify に入れる |
| M1 | 静止画 + 生データ + クリア表示 | コンセプト画を背景にし、Vue の窓（掲示板・パーティ・メッセージ）に本物の値を出す。中身: collector の 60 秒ごとの収集（open / closed の Issue・PR、全ページ、原子的な書き込み）、snapshot 配信プラグイン、画面の 30 秒ごとの再取得、差分による 1 回限りのクリア表示（Vue のメッセージ窓）、`schemaVersion` と古さの表示。domain のテストもここで |
| M2 | Canvas の社屋 | タイルとスプライトで社屋を描き直す。6 人が席に座る。イベントで歩く（出発・帰還）、吹き出し、紙吹雪。論理解像度 1024×576（32px タイル × 32×18 マス、キャラは 64×64 のコマ）を画面の幅に合わせて拡大する（2026-10-12、社長の判断で 16px から 2 倍に）。演出はメッセージ窓に出た瞬間に始まる |
| M3 | リアルタイム | Claude Code の hooks で「今まさに作業中 / 許可待ち」を拾う。hooks は `~/.conect-guild/events.jsonl`（0600）に 1 行追記するだけ。collector が読み、snapshot に混ぜる。`tool_input` は保存しない。**5 セッションの `~/.claude/settings.json` を触るので、着手前に社長の承認を改めて取る** |
| M4 | 遊び | 効果音、昼夜、累積の経験値とレベル（集計の持ち方を設計してから）、レベルアップの演出、ネコ |

M1 まで行けば「本物の Issue が掲示板に出て、クローズでクリアのメッセージが出る」ところまで見られる。歩行などの演出は M2 から。

## 7. 依存の方針（具体）

- 実行時: `vue`、`zod`
- 開発時: `vite`、`typescript`、`vue-tsc`、`vitest`、`eslint` + `eslint-plugin-vue` + `eslint-plugin-sonarjs` + `typescript-eslint`、`prettier`。E2E は M2 以降に `@playwright/test`
- 入れ方:
  1. `npm install <pkg> --ignore-scripts --before=<7 日前の日付>` で npm に版を決めさせる（記憶から版を書かない）。`--before` で推移依存も含めて 7 日より前に公開された版だけになり、`--ignore-scripts` で確かめる前にスクリプトが走らない
  2. `npm view <pkg> time --json` で入った版の公開日を確かめる
  3. 公開から 7 日未満なら `npm install <pkg>@<1 つ前の版> --ignore-scripts` で固定し直す
  4. lockfile をコミットする。CI は `npm ci --ignore-scripts` で lockfile どおりに入れる
- 推移依存のインストールスクリプトは `npm query ':attr(scripts,[preinstall])'`・`[install]`・`[postinstall]` で確かめる。どうしても要るものだけ、理由を PR に書いて `npm rebuild <pkg>` で個別に実行する
- 追加・更新のたびに `npm outdated` と `npm audit` を見て報告
- 避けるもの: `postinstall` でスクリプトが走るもの、メンテナが 1 人で更新が止まっているもの、描画ライブラリ（最初は不要）
- 収集スクリプトの実行: Node の TypeScript 直接実行（型除去。Mac mini は Node v26.10、2026-10-12 確認）。`tsx` などの実行ランタイムは入れない。そのため collector は型を消すだけで動く構文に限る
  - `enum`・parameter properties・`namespace` を使わない
  - `packages/collector/tsconfig.json` に `erasableSyntaxOnly: true`、`allowImportingTsExtensions: true`、`noEmit: true`、`module: "nodenext"`（Vite 用の tsconfig とは分ける）
  - import は `.ts` 拡張子付きで書く

## 8. 絵の素材

- コンセプト画（codex 生成、`assets/concept/`）: 背景（M1）と目標の見た目として使う。生成の指示書も同じ場所に置く
- タイル（床・壁・机・本棚など 15 種）: codex にコンセプト画の雰囲気で生成させ、32px グリッドのシートに切り出す（`assets/tiles/`）。2026-10-12 の社長の判断で CC0 素材（Kenney など）から切り替えた。出所とライセンスを `assets/README.md` に書く
- 6 体（かなめ・みのり・ひびき・ひらめ・ささえ・ゆきひろ）のスプライト: codex に「同じキャラの正面・横・歩き 2 コマ」を生成させ、手で整える。生成の指示書もリポジトリに残す
- 実在のゲームの素材・ロゴは使わない

## 9. テストと CI

- domain は vitest で全関数をカバー（Issue → Quest の対応、ラベル 0 個・複数の扱い、PR の対応 Issue の拾い方、ルール変更のパス照合、状態の優先順位、差分 → イベントと重複の除去、初回・巻き戻し・長い空白・基準に無いまま閉じたものの扱い、最近の成果）。時刻と乱数は注入できるようにする
- adapters の検証は、壊れた JSON・`schemaVersion` 違い・localStorage の例外を食わせて落ちないことを確かめる
- collector は、複数ページの出力を平坦化できること、`gh` の出力の検証失敗時に snapshot を書き換えないことを確かめる
- ESLint（sonarjs の複雑度・ネスト・引数）をエラー、`max-lines` 400 / `max-lines-per-function` 60 を warning で入れる
- `npm run verify` = lint + typecheck + test。CI は push と PR で `npm ci --ignore-scripts` → verify → build（サンプルデータのみ）

## 10. 決めたこと（2026-10-12）

1. zod を入れる（実行時の依存は Vue と zod の 2 つ）
2. 置き場所は `~/my-apps/conect-guild`。`~/.claude/repos.md` に行を足す
3. タイルもキャラ 6 体も codex 生成（タイルは当初 CC0 素材の予定だったが、2026-10-12 に社長の判断でコンセプト画に雰囲気を合わせるため codex 生成に変えた）
4. M3 の hooks は、着手前に改めて承認を取る
5. メンバーの名前は確定（1 章の表。かなめ・みのり・ひびき・ひらめ・ささえ・ゆきひろ）
6. 実データは `apps/web/.data/` に置き、開発時だけの自作プラグインで配信する。build と CI はダミーだけ（5 章）

## 11. 作り方の体制

- リポジトリ `conect-guild` を作業ディレクトリにしたセッションで作る。このリポジトリの `CLAUDE.md` に上の原則（依存・通信・データ）を書き、作るセッションに読ませる
- 段階ごとに Issue を切って PR にする（M0 から）。main に直接 push しない
- 参考にしてよい OSS（すべて MIT）: pixel-agents（イベントの設計、hooks の受け方）、pixtuoid（ソケットと 0600 の扱い）。コードの丸写しはせず、仕組みを参考にする

## 変更履歴

- **M2（2026-10-12）** Canvas の社屋を入れた
  - タイルを CC0 素材から codex 生成に変えた（8 章、10 章 3。社長の判断）
  - 論理解像度を 1024×576（32px タイル、キャラ 64px）にした（6 章。社長の判断で 2 倍に）
  - render/ の中身を書いた（3 章）
  - 閉じ直しの判定を「基準の closedAt より後」に改めた。基準の fetchedAt より新しい closedAt の Issue が取得のたびにクリアを出していた。closedAt が古い値に変わっただけでは閉じ直しにしない（4.4 の実装の修正）
- **M1（2026-10-12）** collector の実装に合わせ、ページ送りを `--paginate --slurp` から `--paginate --jq`（要るフィールドだけに絞る）に改めた（4.1）
- **v0.2（2026-10-12）** codex レビュー 1 周目を反映
  - 実データを `public/` から `apps/web/.data/`（gitignore、0600、原子的な置き換え）に移し、開発時だけの自作 Vite プラグインで配信。`server.host` を `127.0.0.1` に固定し、build・CI はダミーだけにした（5 章を新設）
  - 収集の範囲を定義: 対象リポジトリの固定、全ページ取得、closed / merged は直近 7 日、Issue から PR を除く、失敗時は書き換えない（4.1）
  - PR の担当を `#番号` の対応 Issue → ブランチ接頭辞 → 担当不明の順で決め、変更ファイルのパスで「社長の承認まち」と「かなめの確認まち」を分けた。状態の優先順位を表にした（4.5、4.6）
  - localStorage は番号・状態・時刻だけを基準として保存し、初回・失敗時・使えないときの扱いを決めた。画面は 30 秒ごとに no-store で再取得し、イベントの重複を除く（4.3、4.4）
  - collector は `execFile` の引数配列で `gh` を呼び、ログに題名を出さない（4.1）
  - M1 の中身に定期収集・open / closed の収集・1 回限りのクリア表示を明記し、歩行は M2 に分けた（6 章）
  - 依存の 7 日ルールの固定手順、`npm ci`、推移依存のスクリプト確認、Node の型除去で動く構文の制約と M0 での実行確認を足した（7 章）
  - `schemaVersion`、古さの印、部門ラベル 0 個・複数の扱いを足し、メンバーの名前を確定した
  - 2 周目のレビューを受けて: 外部の文字列は文字として描く原則（`v-html` 禁止）、`--ignore-scripts` と `--before` による依存の入れ方、`--paginate --slurp` と `maxBuffer`、取りこぼし・巻き戻しの規則、`#番号` とルール変更のパスの具体的な照合規則、経験値を「最近の成果」にして累積は M4 へ、M0 の collector の確認範囲と `noEmit` を足した
