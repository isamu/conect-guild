"""Normalize the codex-generated sheet (tiles_raw.png) into a 16px tileset.

Usage: python build_tileset.py <tiles_raw.png> <tileset.png>
Ran with Python 3.14.7 and Pillow 12.3.0 (installed in a throwaway venv,
not a project dependency).

The raw image follows prompt.txt: an 8x4 grid of equal cells on a #FF00FF
background. For every tile we find the drawn pixels inside its slot, crop
them, shrink them into w*16 x h*16 and turn the magenta into transparency.
Keep LAYOUT in sync with tiles.ts.
"""

import sys

from PIL import Image

TILE = 16
SHEET_COLS = 8
SHEET_ROWS = 4

# name: (col, row, w, h, kind). "texture" fills its box edge to edge and must
# tile seamlessly; "object" keeps its aspect and sits bottom-center.
LAYOUT = {
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
    "counter": (5, 1, 3, 1, "object"),
    "door": (0, 2, 1, 2, "object"),
    "shelf": (1, 2, 1, 2, "object"),
    "throne": (2, 2, 2, 2, "object"),
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


def main(src, dst):
    raw = keyed(Image.open(src))
    cell_w = raw.width / SHEET_COLS
    cell_h = raw.height / SHEET_ROWS
    boxes = components(raw)
    sheet = Image.new("RGBA", (SHEET_COLS * TILE, SHEET_ROWS * TILE), (0, 0, 0, 0))
    for name, (col, row, w, h, kind) in LAYOUT.items():
        box = (
            round(col * cell_w),
            round(row * cell_h),
            round((col + w) * cell_w),
            round((row + h) * cell_h),
        )
        bbox = SOURCE_BOX.get(name) or drawn_bbox(boxes, box)
        size = (w * TILE, h * TILE)
        if kind == "texture":
            tile = build_texture(raw, bbox, name, size)
        else:
            tile = build_object(raw, bbox, size)
        sheet.paste(tile, (col * TILE, row * TILE))
    sheet.save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
