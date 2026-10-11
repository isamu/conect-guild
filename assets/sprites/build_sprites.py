"""Cut the codex-generated sprite sheet into one strip of four square frames per member.

Input: a 1024x1536 sheet of 4 columns x 6 rows on a magenta (#ff00ff) background (see prompt.txt).
Default input is source-sheet.png next to this script; default output directory is this script's.
Output: <out_dir>/<memberId>.png, four FRAME x FRAME frames (64x64, so 256x64) side by side
(0 = front idle, 1 = facing right, 2 = walk right 1, 3 = walk right 2), transparent background,
feet on the bottom edge, centred horizontally. Optionally a 2x preview of all frames.

Usage: python build_sprites.py [--sheet <sheet.png>] [--out <out_dir>] [--preview <preview.png>]
Needs Pillow only. Not a project dependency; run it from a throwaway venv.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

MEMBERS = ["kaname", "minori", "hibiki", "hirame", "sasae", "yukihiro"]
COLS = 4
SHEET_SIZE = (1024, 1536)
HERE = Path(__file__).resolve().parent
# Frame size in pixels. Change it here only; everything else derives from it.
FRAME = 64
# Leave a 1px margin on top and both sides so outlines are never clipped.
MAX_H = FRAME - 1
MAX_W = FRAME - 2
ALPHA_CUTOFF = 0.5
# A crown tip or hair may touch the cell edge, but most of the outline must be background.
MIN_OUTLINE_BACKGROUND = 0.9
PREVIEW_SCALE = 2
# Outline pixels next to the background are blended with magenta by the generator.
# Within this many source pixels of the background, dark magenta-tinted pixels are pulled to grey.
SPILL_REACH = 2
# The background has green ~3, so outline/background blends stay below this. Dark purple hair
# shades (green 20-40) stay above it and keep their colour.
SPILL_MAX_GREEN = 20


def threshold(channel, test):
    return channel.point(lambda v: 255 if test(v) else 0)


def cut_cells(sheet):
    cell_w = sheet.width // COLS
    cell_h = sheet.height // len(MEMBERS)
    for row in range(len(MEMBERS)):
        yield [
            sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            for col in range(COLS)
        ]


def all_of(*masks):
    result = masks[0]
    for mask in masks[1:]:
        result = ImageChops.multiply(result, mask)
    return result


def despilled(cell, background):
    """Turn dark outline pixels tinted by the magenta background back into neutral dark grey.

    Only pixels near the background with almost no green, red close to blue and both clearly
    above green are touched, so purple hair, pink hair and red cloth keep their colours.
    """
    r, g, b = cell.split()
    near_background = ImageChops.subtract(
        background.filter(ImageFilter.MaxFilter(2 * SPILL_REACH + 1)), background
    )
    spill = all_of(
        near_background,
        threshold(g, lambda v: v < SPILL_MAX_GREEN),
        threshold(ImageChops.subtract(r, g), lambda v: v > 30),
        threshold(ImageChops.difference(r, b), lambda v: v < 60),
    )
    fixed = cell.copy()
    fixed.paste(Image.merge("RGB", (g, g, g)), (0, 0), spill)
    return fixed


def keyed(cell):
    """Return the cell as RGBA with the magenta background made transparent."""
    r, g, b = cell.split()
    background = all_of(
        threshold(r, lambda v: v > 170), threshold(b, lambda v: v > 170), threshold(g, lambda v: v < 90)
    )
    rgba = despilled(cell, background).convert("RGBA")
    rgba.putalpha(ImageChops.invert(background))
    return rgba


def outline_background_ratio(rgba):
    """Share of the cell's one-pixel outline that is transparent (keyed background)."""
    alpha = rgba.getchannel("A")
    w, h = alpha.size
    edges = [alpha.crop(box) for box in ((0, 0, w, 1), (0, h - 1, w, h), (0, 0, 1, h), (w - 1, 0, w, h))]
    clear = sum(edge.histogram()[0] for edge in edges)
    return clear / (2 * w + 2 * h)


def shrink(rgba, size):
    """Area-average downscale on premultiplied colour, then make alpha binary (crisp pixel edges)."""
    small = rgba.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    opaque = threshold(small.getchannel("A"), lambda v: v >= 255 * ALPHA_CUTOFF)
    crisp = Image.new("RGBA", size, (0, 0, 0, 0))
    crisp.paste(small.convert("RGB"), (0, 0), opaque)
    crisp.putalpha(opaque)
    return crisp


def build(sheet_path, out_dir, preview_path=None):
    sprite_paths = {(out_dir / f"{m}.png").resolve() for m in MEMBERS}
    if sheet_path.resolve() in sprite_paths:
        sys.exit(f"{sheet_path}: a sprite would overwrite the input sheet")
    if preview_path and preview_path.resolve() in sprite_paths | {sheet_path.resolve()}:
        sys.exit(f"{preview_path}: the preview would overwrite a sprite or the input sheet")
    sheet = Image.open(sheet_path).convert("RGB")
    if sheet.size != SHEET_SIZE:
        sys.exit(f"{sheet_path}: expected {SHEET_SIZE[0]}x{SHEET_SIZE[1]}, got {sheet.width}x{sheet.height}")
    rows = [[keyed(cell) for cell in row] for row in cut_cells(sheet)]
    # One scale for every frame of every member so all six stand at the same size.
    boxes = [[cell.getbbox() for cell in row] for row in rows]
    empty = [f"{MEMBERS[r]} frame {c}" for r, row in enumerate(boxes) for c, box in enumerate(row) if box is None]
    if empty:
        sys.exit(f"{sheet_path}: no character found in " + ", ".join(empty))
    # The cell outline should be almost all background; otherwise the key colour is not magenta.
    off_key = [
        f"{MEMBERS[r]} frame {c}"
        for r, row in enumerate(rows)
        for c, cell in enumerate(row)
        if outline_background_ratio(cell) < MIN_OUTLINE_BACKGROUND
    ]
    if off_key:
        sys.exit(f"{sheet_path}: background is not magenta in " + ", ".join(off_key))
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
