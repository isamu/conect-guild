# assets

| パス | 中身 | 出所 | ライセンス |
|---|---|---|---|
| `concept/rpg-company-ui.png` | コンセプト画（1672×940） | codex の画像生成（2026-10-12）。指示書は `concept/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tiles_raw.png` | タイルシートの生成元（1024×512、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` を参考画像として渡した。指示書は `tiles/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/counter_raw.png` | 受付カウンターの生成元（1024×512、背景 #FF00FF。左端・くり返す中央・右端） | codex の画像生成（2026-10-12）。`tiles/tiles_raw.png` と `concept/rpg-company-ui.png` を参考画像として渡した。指示書は `tiles/prompt-counter.txt` | このリポジトリと同じ MIT |
| `tiles/tileset.png` | タイルシート（32px グリッド 10×6 = 320×192、透過）。位置と大きさは `tiles/tiles.ts` | `tiles/tiles_raw.png` と `tiles/counter_raw.png` を `tiles/build_tileset.py` で切り出し・縮小・透過したもの | このリポジトリと同じ MIT |
| `sprites/<memberId>.png` | キャラ 6 体（kaname, minori, hibiki, hirame, sasae, yukihiro）。80×80 のコマが横に 4 つ（320×80）（正面・右向き・右向き歩き 1・右向き歩き 2）、透過 | codex の画像生成（2026-10-12、2 回目を採用）。指示書は `sprites/prompt.txt`。参考画像は `concept/rpg-company-ui.png` と 1 回目の生成結果（同日に codex で生成。未収録。ライセンスは同じく MIT）。生成した 1024×1536 のシート `sprites/source-sheet.png` から `sprites/build_sprites.py` で切り出し・縮小・透過 | このリポジトリと同じ MIT |
| `decor/decor_raw_a.png`・`decor/decor_raw_b.png` | 飾りの小物の生成元（A: 壁掛けと机の上 1024×512、B: 床置き 1024×1024、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` と `tiles/tiles_raw.png` を参考画像として渡した。指示書は `decor/prompt.txt` | このリポジトリと同じ MIT |
| `decor/decor.png` | 飾りの小物 49 種のシート（32px グリッド 8×10 = 256×320、透過）。位置は `decor/decor.ts` | `decor/decor_raw_a.png`・`decor/decor_raw_b.png` を `decor/build_decor.py` で切り出し・縮小（原則一律 1/4。枠をわずかに超える小物だけ最大 15% 追加で縮める）・透過したもの | このリポジトリと同じ MIT |
| `props/props_raw.png` | 手に持つ小物（巻物・宝箱）の生成元（1024×512、左右 2 マス、背景 #FF00FF） | codex の画像生成（2026-10-12、1 回目を採用）。`concept/rpg-company-ui.png`・`sprites/source-sheet.png`・`decor/decor_raw_b.png` を参考画像として渡した。指示書は `props/prompt.txt` | このリポジトリと同じ MIT |
| `props/props.png` | 手に持つ小物 2 種（scroll・chest）のシート（40px グリッド 2×1 = 80×40、透過）。位置は `props/props.ts` | `props/props_raw.png` を `props/build_props.py` で切り出し・縮小（一律 0.085 倍）・透過したもの | このリポジトリと同じ MIT |

タイル（codex 生成。2026-10-12 の社長の判断で CC0 素材から切り替えた）、キャラ 6 体・飾りの小物・手に持つ小物（codex 生成）は上の行のとおり。実在のゲームの素材・ロゴは使わない。
