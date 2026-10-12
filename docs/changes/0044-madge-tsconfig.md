# #44 CI の scoria で循環 import の検査が飛ばされうる（2026-10-12）

- **Issue #44（2026-10-12）** CI の scoria で循環 import の検査が毎回飛ばされていた（「madge produced no readable report」で `complete: false`）のを直した。リポジトリ直下に `.madgerc` を置き、madge に `apps/web/tsconfig.app.json` を渡して `.vue` の import を TypeScript の解決で読ませる。ファイルの並びに関係なく測れ、`.vue` を通る循環も数えるようになった（9 章）。依存は足していない
