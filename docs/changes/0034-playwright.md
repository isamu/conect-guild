# #34 Playwright で画面の E2E テストを入れる（2026-10-12）

- **Issue #34（2026-10-12）** Playwright で画面の E2E テストを入れた（7 章、9 章）。開発時の依存に `@playwright/test` を足した（社長の承認済み）
  - 最初は `.data/snapshot.json` にサンプルを書いて開発サーバーから返していたが、同じ checkout の collector と上書きし合い、後始末で実データを消しうるため、`.data` に触れず route で返す形に改めた（統合レビューの指摘）
