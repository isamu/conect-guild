# #50 scoria が vue を検出できない（detection drift）（2026-10-12）

- **Issue #50（2026-10-12）** scoria の「vue is in the config but no longer detected」を調べた。stack の検出がリポジトリ直下の package.json しか読まないための誤検知で、計測は設定の `stacks` で行われ `.vue` も数えられている。設定では消せないため、設定と baseline は変えず、理由を 9 章に書いた。依存は足していない
