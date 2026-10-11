# assets

| パス | 中身 | 出所 | ライセンス |
|---|---|---|---|
| `concept/rpg-company-ui.png` | コンセプト画（1672×940） | codex の画像生成（2026-10-12）。指示書は `concept/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tiles_raw.png` | タイルシートの生成元（1024×512、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` を参考画像として渡した。指示書は `tiles/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tileset.png` | タイルシート（32px グリッド 8×4 = 256×128、透過）。位置は `tiles/tiles.ts` | `tiles/tiles_raw.png` を `tiles/build_tileset.py` で切り出し・縮小・透過したもの | このリポジトリと同じ MIT |
| `decor/decor_raw_a.png`・`decor/decor_raw_b.png` | 飾りの小物の生成元（A: 壁掛けと机の上 1024×512、B: 床置き 1024×1024、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` と `tiles/tiles_raw.png` を参考画像として渡した。指示書は `decor/prompt.txt` | このリポジトリと同じ MIT |
| `decor/decor.png` | 飾りの小物 49 種のシート（32px グリッド 8×10 = 256×320、透過）。位置は `decor/decor.ts` | `decor/decor_raw_a.png`・`decor/decor_raw_b.png` を `decor/build_decor.py` で切り出し・縮小（一律 1/4）・透過したもの | このリポジトリと同じ MIT |

タイルは codex 生成に切り替えた（2026-10-12、社長の判断）。スプライト（キャラ 6 体、codex 生成）は M2 で足し、ここに行を足す。実在のゲームの素材・ロゴは使わない。
