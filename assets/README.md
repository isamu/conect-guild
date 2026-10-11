# assets

| パス | 中身 | 出所 | ライセンス |
|---|---|---|---|
| `concept/rpg-company-ui.png` | コンセプト画（1672×940） | codex の画像生成（2026-10-12）。指示書は `concept/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tiles_raw.png` | タイルシートの生成元（1024×512、背景 #FF00FF） | codex の画像生成（2026-10-12）。`concept/rpg-company-ui.png` を参考画像として渡した。指示書は `tiles/prompt.txt` | このリポジトリと同じ MIT |
| `tiles/tileset.png` | タイルシート（32px グリッド 8×4 = 256×128、透過）。位置は `tiles/tiles.ts` | `tiles/tiles_raw.png` を `tiles/build_tileset.py` で切り出し・縮小・透過したもの | このリポジトリと同じ MIT |

タイルは codex 生成に切り替えた（2026-10-12、社長の判断）。スプライト（キャラ 6 体、codex 生成）は M2 で足し、ここに行を足す。実在のゲームの素材・ロゴは使わない。
