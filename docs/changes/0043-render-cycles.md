# #43 render の循環 import を解く（2026-10-12）

- **Issue #43（2026-10-12）** render の循環 import を解いた。小物の動く・動かないの振り分けを decor.ts から animatedDecor.ts に分け、decor.ts が render の他のファイルを読まないようにした（3 章）
