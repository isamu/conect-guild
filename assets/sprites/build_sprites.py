"""Cut the codex-generated sprite sheet into one 128x32 strip per member.

Input: a 1024x1536 sheet of 4 columns x 6 rows on a magenta (#ff00ff) background (see prompt.txt).
Default input is source-sheet.png next to this script; default output directory is this script's.
Output: <out_dir>/<memberId>.png, four 32x32 frames side by side
(0 = front idle, 1 = facing right, 2 = walk right 1, 3 = walk right 2), transparent background,
feet on the bottom edge, centred horizontally. Optionally a 4x preview of all frames.

Usage: python build_sprites.py [--sheet <sheet.png>] [--out <out_dir>] [--preview <preview.png>]
Needs Pillow only. Not a project dependency; run it from a throwaway venv.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

MEMBERS = ["kaname", "minori", "hibiki", "hirame", "sasae", "yukihiro"]
COLS = 4
SHEET_SIZE = (1024, 1536)
HERE = Path(__file__).resolve().parent
FRAME = 32
# Leave a 1px margin on top and both sides so outlines are never clipped.
MAX_H = FRAME - 1
MAX_W = FRAME - 2
ALPHA_CUTOFF = 0.5
PREVIEW_SCALE = 4


def is_background(rgb):
    r, g, b = rgb
    return r > 170 and b > 170 and g < 90


def cut_cells(sheet):
    cell_w = sheet.width // COLS
    cell_h = sheet.height // len(MEMBERS)
    for row in range(len(MEMBERS)):
        yield [
            sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            for col in range(COLS)
        ]


def keyed(cell):
    """Return the cell as RGBA with the magenta background made transparent."""
    rgba = cell.convert("RGBA")
    rgba.putdata(
        [(r, g, b, 0) if is_background((r, g, b)) else (r, g, b, 255) for r, g, b, _ in rgba.get_flattened_data()]
    )
    return rgba


def shrink(rgba, size):
    """Area-average downscale on premultiplied colour, then make alpha binary (crisp pixel edges)."""
    small = rgba.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    small.putdata(
        [(r, g, b, 255) if a >= 255 * ALPHA_CUTOFF else (0, 0, 0, 0) for r, g, b, a in small.get_flattened_data()]
    )
    return small


def build(sheet_path, out_dir, preview_path=None):
    sheet = Image.open(sheet_path).convert("RGB")
    if sheet.size != SHEET_SIZE:
        sys.exit(f"{sheet_path}: expected {SHEET_SIZE[0]}x{SHEET_SIZE[1]}, got {sheet.width}x{sheet.height}")
    rows = [[keyed(cell) for cell in row] for row in cut_cells(sheet)]
    # One scale for every frame of every member so all six stand at the same size.
    boxes = [[cell.getbbox() for cell in row] for row in rows]
    empty = [f"{MEMBERS[r]} frame {c}" for r, row in enumerate(boxes) for c, box in enumerate(row) if box is None]
    if empty:
        sys.exit(f"{sheet_path}: no character found in " + ", ".join(empty))
    tallest = max(box[3] - box[1] for row in boxes for box in row)
    widest = max(box[2] - box[0] for row in boxes for box in row)
    scale = min(MAX_H / tallest, MAX_W / widest)

    out_dir.mkdir(parents=True, exist_ok=True)
    strips = []
    for member, row, row_boxes in zip(MEMBERS, rows, boxes):
        strip = Image.new("RGBA", (FRAME * COLS, FRAME), (0, 0, 0, 0))
        for col, (cell, box) in enumerate(zip(row, row_boxes)):
            w = max(1, round((box[2] - box[0]) * scale))
            h = max(1, round((box[3] - box[1]) * scale))
            sprite = shrink(cell.crop(box), (w, h))
            strip.paste(sprite, (col * FRAME + (FRAME - w) // 2, FRAME - h), sprite)
        strip.save(out_dir / f"{member}.png", optimize=True)
        strips.append(strip)

    if preview_path:
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview = Image.new("RGBA", (FRAME * COLS, FRAME * len(MEMBERS)), (60, 60, 70, 255))
        for i, strip in enumerate(strips):
            preview.paste(strip, (0, i * FRAME), strip)
        preview.resize(
            (preview.width * PREVIEW_SCALE, preview.height * PREVIEW_SCALE), Image.Resampling.NEAREST
        ).save(preview_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sheet", type=Path, default=HERE / "source-sheet.png")
    parser.add_argument("--out", type=Path, default=HERE)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    build(args.sheet, args.out, args.preview)
