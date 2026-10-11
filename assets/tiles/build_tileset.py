"""Normalize the codex-generated sheets into a 32px tileset.

Usage: python build_tileset.py <tiles_raw.png> <counter_raw.png> <tileset.png>
Ran with Python 3.14.7 and Pillow 12.3.0 (installed in a throwaway venv,
not a project dependency).

The raw image follows prompt.txt: an 8x4 grid of equal cells on a #FF00FF
background. For every tile we find the drawn pixels inside its slot, crop
them, shrink them into their SHEET box (w*32 x h*32; objects keep their
aspect) and turn the magenta into transparency. Shrinking is an area average
(BOX); nearest-neighbour was tried and left magenta fringes and jagged lines.

counter_raw.png follows prompt-counter.txt: one long counter across the lower
two rows of an 8x4 grid of 128px cells. Its cells are cut as they are (no bbox
fitting) so the left end, the repeating middle and the right end line up.
Keep SHEET in sync with tiles.ts.
"""

import hashlib
import os
import sys

from PIL import Image

RAW_SIZE = (1024, 512)
# SOURCE_BOX below is measured on this exact file; refuse any other input.
# After regenerating tiles_raw.png, re-measure SOURCE_BOX and update the hash.
RAW_SHA256 = "855e94b468a0c289ad83065c439c9c85fd21e3b1f1f2d1ab68aaec4084d278df"
COUNTER_RAW_SIZE = (1024, 512)
COUNTER_RAW_SHA256 = "601c0aa7a604e81b41d3b3d948376e3b3af0ddbff00e3f40af46018d69fc345a"
TILE = 32
SHEET_COLS = 10
SHEET_ROWS = 6

# Where each piece was drawn in tiles_raw.png (prompt.txt's 8x4 grid of 128px
# cells): name -> (col, row, w, h, kind). "texture" fills its box edge to edge
# and must tile seamlessly; "object" keeps its aspect and sits bottom-center
# in its SHEET box, filling it as far as the aspect allows.
SOURCE_SLOTS = {
    "floor": (0, 0, 1, 1, "texture"),
    "floor-carpet": (1, 0, 1, 1, "texture"),
    "wall": (2, 0, 1, 1, "texture"),
    "wall-top": (3, 0, 1, 1, "texture"),
    "rug-red": (4, 0, 1, 1, "texture"),
    "window": (5, 0, 1, 1, "object"),
    "plant": (6, 0, 1, 1, "object"),
    "chair": (7, 0, 1, 1, "object"),
    "crate": (0, 1, 1, 1, "object"),
    "desk": (1, 1, 2, 1, "object"),
    "board": (3, 1, 2, 1, "object"),
    "door": (0, 2, 1, 2, "object"),
    "shelf": (1, 2, 1, 2, "object"),
    "throne": (2, 2, 2, 2, "object"),
}

# Where each piece lands in tileset.png and how many tiles it covers:
# name -> (col, row, w, h). Keep in sync with tiles.ts.
SHEET = {
    "floor": (0, 0, 1, 1),
    "floor-carpet": (1, 0, 1, 1),
    "wall": (2, 0, 1, 1),
    "wall-top": (3, 0, 1, 1),
    "rug-red": (4, 0, 1, 1),
    "plant": (5, 0, 1, 1),
    "crate": (6, 0, 1, 1),
    "desk": (0, 1, 4, 2),
    "board": (4, 1, 3, 2),
    "chair": (7, 1, 1, 2),
    "window": (8, 1, 2, 2),
    "throne": (0, 3, 3, 3),
    "shelf": (3, 3, 2, 3),
    "door": (5, 3, 2, 3),
    "counter-left": (7, 3, 1, 2),
    "counter-mid": (8, 3, 1, 2),
    "counter-right": (9, 3, 1, 2),
}

# Counter parts: name -> column of counter_raw.png's 8x4 grid. The counter
# fills the lower two rows; columns 1-6 repeat one 128px pattern whose
# pillars sit on the cell borders, so column 3 wraps onto itself.
COUNTER_PARTS = {
    "counter-left": 0,
    "counter-mid": 3,
    "counter-right": 7,
}

# Texture crops: (left, top, right, bottom) as fractions of the drawn bbox.
# The generator draws a frame or a fringe at the edges, so textures take an
# inner window whose opposite edges continue each other.
TEXTURE_WINDOW = {
    "floor": (0.03, 0.03, 0.97, 0.97),
    "floor-carpet": (0.2, 0.05, 0.8, 0.95),
    "wall": (0.03, 0.03, 0.97, 0.97),
    "wall-top": (0.03, 0.03, 0.97, 0.3),
    "rug-red": (0.25, 0.05, 0.75, 0.95),
}

# Hand-picked source boxes (raw pixels) for tiles_raw.png where detection
# fails: the shelf touches the red carpet drawn under the throne, and the
# throne should not carry that carpet.
SOURCE_BOX = {
    "shelf": (133, 257, 291, 497),
    "throne": (294, 259, 476, 468),
}


def is_key(px):
    r, g, b = px[:3]
    return r > 150 and b > 150 and g < 110 and abs(r - b) < 90


def keyed(img):
    """RGBA copy where the chroma key color becomes fully transparent."""
    out = img.convert("RGBA")
    out.putdata([(0, 0, 0, 0) if is_key(p) else (p[0], p[1], p[2], 255) for p in out.get_flattened_data()])
    return out


def components(img, min_px=40):
    """Bounding boxes of 4-connected opaque regions (small specks dropped)."""
    alpha = img.getchannel("A").load()
    w, h = img.size
    seen = bytearray(w * h)
    boxes = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or not alpha[x0, y0]:
                continue
            seen[y0 * w + x0] = 1
            stack = [(x0, y0)]
            x_min, y_min, x_max, y_max, count = x0, y0, x0, y0, 0
            while stack:
                x, y = stack.pop()
                count += 1
                x_min, y_min = min(x_min, x), min(y_min, y)
                x_max, y_max = max(x_max, x), max(y_max, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and alpha[nx, ny]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if count >= min_px:
                boxes.append((x_min, y_min, x_max + 1, y_max + 1))
    return boxes


def drawn_bbox(boxes, slot):
    """Union of the components whose center lies inside slot."""
    inside = [
        b for b in boxes
        if slot[0] <= (b[0] + b[2]) / 2 < slot[2] and slot[1] <= (b[1] + b[3]) / 2 < slot[3]
    ]
    if not inside:
        raise SystemExit(f"empty slot at {slot}")
    return (
        min(b[0] for b in inside),
        min(b[1] for b in inside),
        max(b[2] for b in inside),
        max(b[3] for b in inside),
    )


def slot_bbox(img, slot):
    """Bounding box of opaque pixels clipped to slot (textures fill their cell
    edge to edge, so neighbours may touch and global components would merge)."""
    bbox = img.crop(slot).getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit(f"empty slot at {slot}")
    return (slot[0] + bbox[0], slot[1] + bbox[1], slot[0] + bbox[2], slot[1] + bbox[3])


def checked_source_box(img, name, min_opaque=0.5):
    """SOURCE_BOX entry, refusing boxes outside the image or mostly empty."""
    box = SOURCE_BOX[name]
    if not (0 <= box[0] < box[2] <= img.width and 0 <= box[1] < box[3] <= img.height):
        raise SystemExit(f"SOURCE_BOX[{name!r}] {box} is outside the {img.size} image")
    alpha = img.crop(box).getchannel("A")
    opaque = alpha.histogram()[255] / (alpha.width * alpha.height)
    if opaque < min_opaque:
        raise SystemExit(f"SOURCE_BOX[{name!r}] is only {opaque:.0%} opaque; wrong source image?")
    return box


def shrink(img, size):
    """Area-average resize with premultiplied alpha, then binary alpha."""
    small = img.convert("RGBa").resize(size, Image.Resampling.BOX).convert("RGBA")
    small.putdata([(r, g, b, 255) if a >= 128 else (0, 0, 0, 0) for r, g, b, a in small.get_flattened_data()])
    return small


def build_texture(img, bbox, name, size):
    fx0, fy0, fx1, fy1 = TEXTURE_WINDOW[name]
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    inner = (
        bbox[0] + round(w * fx0),
        bbox[1] + round(h * fy0),
        bbox[0] + round(w * fx1),
        bbox[1] + round(h * fy1),
    )
    tile = shrink(img.crop(inner), size)
    tile.putdata([(r, g, b, 255) for r, g, b, _ in tile.get_flattened_data()])
    return tile


def build_object(img, bbox, size):
    crop = img.crop(bbox)
    scale = min(size[0] / crop.width, size[1] / crop.height)
    fit = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    small = shrink(crop, fit)
    tile = Image.new("RGBA", size, (0, 0, 0, 0))
    tile.paste(small, ((size[0] - fit[0]) // 2, size[1] - fit[1]))
    return tile


def load_raw(path, size, sha256):
    """Keyed RGBA of path, refusing any file but the one the layout was measured on."""
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != sha256:
        raise SystemExit(f"{path} is not the source image this script was measured on (sha256 {digest})")
    raw = keyed(Image.open(path))
    if raw.size != size:
        raise SystemExit(f"expected a {size} source image, got {raw.size}")
    return raw


def paste_main_tiles(sheet, raw):
    cell = raw.width // 8
    boxes = components(raw)
    for name, (col, row, w, h, kind) in SOURCE_SLOTS.items():
        box = (col * cell, row * cell, (col + w) * cell, (row + h) * cell)
        dst_col, dst_row, dst_w, dst_h = SHEET[name]
        size = (dst_w * TILE, dst_h * TILE)
        if kind == "texture":
            tile = build_texture(raw, slot_bbox(raw, box), name, size)
        else:
            bbox = checked_source_box(raw, name) if name in SOURCE_BOX else drawn_bbox(boxes, box)
            tile = drop_fringe(build_object(raw, bbox, size))
        sheet.paste(tile, (dst_col * TILE, dst_row * TILE))


OUTLINE = (40, 24, 16, 255)


def fringe_fix(r, g, b, a):
    """Pixel after cleaning magenta blends that the key missed.

    Bright blends (rounded corners) become transparent; dark ones, where the
    brown outline met the key, become the outline color.
    """
    if not a:
        return (r, g, b, a)
    if r > 100 and b > 0.7 * r and g < 0.45 * b:
        return (0, 0, 0, 0)
    if max(r, b) > 40 and b > 0.6 * r and r > 0.6 * b and g < 0.5 * min(r, b):
        return OUTLINE
    return (r, g, b, a)


def drop_fringe(tile):
    tile.putdata([fringe_fix(*px) for px in tile.get_flattened_data()])
    return tile


def paste_counter_parts(sheet, raw):
    cell = raw.width // 8
    for name, src_col in COUNTER_PARTS.items():
        col, row, w, h = SHEET[name]
        box = (src_col * cell, raw.height - h * cell, (src_col + w) * cell, raw.height)
        if raw.crop(box).getchannel("A").getbbox() is None:
            raise SystemExit(f"empty counter cell for {name!r} at {box}")
        tile = drop_fringe(shrink(raw.crop(box), (w * TILE, h * TILE)))
        sheet.paste(tile, (col * TILE, row * TILE))


def main(src, counter_src, dst):
    for path in (src, counter_src):
        if os.path.realpath(path) == os.path.realpath(dst) or (os.path.exists(dst) and os.path.samefile(path, dst)):
            raise SystemExit("output path must differ from the source images")
    raw = load_raw(src, RAW_SIZE, RAW_SHA256)
    counter_raw = load_raw(counter_src, COUNTER_RAW_SIZE, COUNTER_RAW_SHA256)
    sheet = Image.new("RGBA", (SHEET_COLS * TILE, SHEET_ROWS * TILE), (0, 0, 0, 0))
    paste_main_tiles(sheet, raw)
    paste_counter_parts(sheet, counter_raw)
    sheet.save(dst)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: python build_tileset.py <tiles_raw.png> <counter_raw.png> <tileset.png>")
    main(sys.argv[1], sys.argv[2], sys.argv[3])
