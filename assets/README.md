# assets

| パス | 中身 | 出所 | ライセンス |
|---|---|---|---|
| `concept/rpg-company-ui.png` | コンセプト画（1672×940） | codex の画像生成（2026-10-12）。指示書は `concept/prompt.txt` | このリポジトリと同じ MIT |
| `sprites/<memberId>.png` | キャラ 6 体（kaname, minori, hibiki, hirame, sasae, yukihiro）。64×64 のコマが横に 4 つ（256×64）（正面・右向き・右向き歩き 1・右向き歩き 2）、透過 | codex の画像生成（2026-10-12、2 回目を採用）。指示書は `sprites/prompt.txt`。参考画像は `concept/rpg-company-ui.png` と 1 回目の生成結果（同日に codex で生成。未収録。ライセンスは同じく MIT）。生成した 1024×1536 のシート `sprites/source-sheet.png` から `sprites/build_sprites.py` で切り出し・縮小・透過 | このリポジトリと同じ MIT |

タイルは M2 で足す。CC0 のタイルセット（Kenney など）を使い、ここに行を足す。キャラ 6 体（codex 生成）は上の `sprites/` の行。実在のゲームの素材・ロゴは使わない。
