# assets

| パス | 中身 | 出所 | ライセンス |
|---|---|---|---|
| `concept/rpg-company-ui.png` | コンセプト画（1672×940） | codex の画像生成（2026-10-12）。指示書は `concept/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tiles_raw.png` | タイルシートの生成元（1024×512、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` を参考画像として渡した。指示書は `tiles/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tileset.png` | タイルシート（32px グリッド 8×4 = 256×128、透過）。位置は `tiles/tiles.ts` | `tiles/tiles_raw.png` を `tiles/build_tileset.py` で切り出し・縮小・透過したもの | このリポジトリと同じ MIT |
| `sprites/<memberId>.png` | キャラ 6 体（kaname, minori, hibiki, hirame, sasae, yukihiro）。64×64 のコマが横に 4 つ（256×64）（正面・右向き・右向き歩き 1・右向き歩き 2）、透過 | codex の画像生成（2026-10-12、2 回目を採用）。指示書は `sprites/prompt.txt`。参考画像は `concept/rpg-company-ui.png` と 1 回目の生成結果（同日に codex で生成。未収録。ライセンスは同じく MIT）。生成した 1024×1536 のシート `sprites/source-sheet.png` から `sprites/build_sprites.py` で切り出し・縮小・透過 | このリポジトリと同じ MIT |

タイル（codex 生成。2026-10-12 の社長の判断で CC0 素材から切り替えた）とキャラ 6 体（codex 生成）は上の行のとおり。実在のゲームの素材・ロゴは使わない。
