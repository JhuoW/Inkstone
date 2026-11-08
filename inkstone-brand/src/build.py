"""Build every Inkstone logo and icon asset.  Usage:  python src/build.py
Needs Python 3 with Pillow + fontTools, and Chrome or Edge (for exact SVG rasterising)."""
import os, io, struct, sys, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import brand
from brand import svg_doc, INK, PAPER
from render import render_svg, downscale

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO, ICON = os.path.join(ROOT, "logo"), os.path.join(ROOT, "icon")
TMP = tempfile.mkdtemp(prefix="inkstone-")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return path


def lockup_svg(fn, fill, title, **kw):
    W, H, body = fn(fill=fill, **kw)
    return svg_doc(W, H, body, title=title)


# ------------------------------------------------------------------ logos
def build_logos():
    svgs = {}
    for suffix, fill in (("", INK), ("-reversed", PAPER)):
        svgs[f"inkstone-mark{suffix}"] = brand.mark_svg(fill=fill)
        svgs[f"inkstone-logo-horizontal{suffix}"] = lockup_svg(brand.lockup_horizontal, fill, "Inkstone 墨石")
        svgs[f"inkstone-logo-horizontal-en{suffix}"] = lockup_svg(brand.lockup_horizontal, fill, "Inkstone", zh=False)
        svgs[f"inkstone-logo-stacked{suffix}"] = lockup_svg(brand.lockup_stacked, fill, "Inkstone 墨石")
        svgs[f"inkstone-logo-zh{suffix}"] = lockup_svg(brand.lockup_zh, fill, "墨石")
    W, H, body = brand.seal()
    svgs["inkstone-seal"] = svg_doc(W, H, body, title="墨石 seal")
    for suffix, fill in (("", INK), ("-reversed", PAPER)):
        wm, wadv, m = brand.wordmark(0, 0, 200, fill, kern=brand.KERN)
        top = m["asc"] * 1.16; bottom = 200 * 0.04
        svgs[f"inkstone-wordmark{suffix}"] = svg_doc(wadv, top + bottom, wm, title="Inkstone",
                                                    vb=f"0 {-top:.2f} {wadv:.2f} {top + bottom:.2f}")
    png_w = {"mark": 2048, "horizontal-en": 4000, "horizontal": 4800, "stacked": 2400, "zh": 3000,
             "seal": 1024, "wordmark": 4000}
    for name, svg in svgs.items():
        write(os.path.join(LOGO, "svg", name + ".svg"), svg)
        key = next(k for k in sorted(png_w, key=len, reverse=True) if k in name)
        render_svg(svg, os.path.join(LOGO, "png", name + ".png"), png_w[key])
    return svgs


# ------------------------------------------------------------------ icons
def ico_bmp_entry(im):
    """32-bit BGRA DIB + AND mask, the most compatible ICO payload (NSIS, old shells)."""
    w, h = im.size
    px = im.convert("RGBA").tobytes("raw", "BGRA")
    rows = [px[y * w * 4:(y + 1) * w * 4] for y in range(h)][::-1]
    mask_row = ((w + 31) // 32) * 4
    alpha = im.getchannel("A").tobytes()
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(mask_row)
        for x in range(w):
            if alpha[y * w + x] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask += row
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(px) + len(mask), 0, 0, 0, 0)
    return header + b"".join(rows) + bytes(mask)


def write_ico(path, images):
    """images: {size: PIL.Image}. 256 is stored as PNG, smaller sizes as BMP."""
    sizes = sorted(images)
    blobs = []
    for s in sizes:
        if s >= 256:
            b = io.BytesIO(); images[s].save(b, "PNG", optimize=True); blobs.append(b.getvalue())
        else:
            blobs.append(ico_bmp_entry(images[s]))
    out = struct.pack("<HHH", 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    for s, b in zip(sizes, blobs):
        out += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(b), offset)
        offset += len(b)
    with open(path, "wb") as f:
        f.write(out + b"".join(blobs))


ICNS_TYPES = [("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128), ("ic08", 256), ("ic09", 512),
              ("ic10", 1024), ("ic11", 32), ("ic12", 64), ("ic13", 256), ("ic14", 512)]


def write_icns(path, pngs):
    """pngs: {pixel_size: png_path}"""
    body = b""
    for t, s in ICNS_TYPES:
        data = open(pngs[s], "rb").read()
        body += t.encode() + struct.pack(">I", len(data) + 8) + data
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(body) + 8) + body)


def build_icons():
    svg = {
        "inkstone-icon": brand.icon_svg("light"),
        "inkstone-icon-dark": brand.icon_svg("dark"),
        "inkstone-icon-square": brand.icon_svg("light", square=True, stone_frac=0.60),
        "inkstone-icon-square-dark": brand.icon_svg("dark", square=True, stone_frac=0.60),
        "inkstone-icon-small": brand.icon_small_svg("light"),
        "inkstone-icon-small-dark": brand.icon_small_svg("dark"),
    }
    for k, v in svg.items():
        write(os.path.join(ICON, "svg", k + ".svg"), v)
    bg, fg = brand.icon_layers()
    write(os.path.join(ICON, "svg", "layers", "icon-background.svg"), bg)
    write(os.path.join(ICON, "svg", "layers", "icon-foreground.svg"), fg)
    render_svg(fg, os.path.join(ICON, "svg", "layers", "icon-foreground.png"), 1024)

    # masters
    m = {}
    def master(key, svg_text, px=2048):
        p = os.path.join(TMP, key + ".png"); render_svg(svg_text, p, px); m[key] = p; return p
    master("mac", svg["inkstone-icon"])
    master("mac_dark", svg["inkstone-icon-dark"])
    master("win", brand.icon_svg("light", tile=1024 * 0.92, shadow=False))
    master("win_dark", brand.icon_svg("dark", tile=1024 * 0.92, shadow=False))
    master("small_mac", brand.icon_small_svg("light", tile_frac=0.86), 1024)
    master("small_win", brand.icon_small_svg("light"), 1024)
    master("small_win_dark", brand.icon_small_svg("dark"), 1024)
    master("square", svg["inkstone-icon-square"])
    master("web", brand.icon_svg("light", tile=1024, shadow=False))

    def pick(kind, s):  # simplified art at tiny sizes
        return m[f"small_{kind}"] if s <= 32 else m[kind]

    # generic PNG set (macOS grid, used by Linux / Electron / Tauri)
    png = os.path.join(ICON, "png")
    for s in (16, 32, 48, 64, 128, 256, 512, 1024):
        downscale(pick("mac", s), os.path.join(png, f"inkstone-icon-{s}.png"), s)
    for s in (256, 512, 1024):
        downscale(m["mac_dark"], os.path.join(png, f"inkstone-icon-dark-{s}.png"), s)

    # macOS .iconset + .icns
    iconset = os.path.join(ICON, "macos", "Inkstone.iconset")
    pngs = {}
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
            p = os.path.join(iconset, name)
            downscale(pick("mac", px), p, px)
            pngs.setdefault(px, p)
    pngs[64] = downscale(m["mac"], os.path.join(TMP, "m64.png"), 64)
    write_icns(os.path.join(ICON, "macos", "Inkstone.icns"), pngs)

    # Windows .ico (+ loose PNGs)
    win = {}
    for s in (16, 20, 24, 32, 40, 48, 64, 128, 256):
        p = downscale(pick("win", s), os.path.join(ICON, "windows", "png", f"inkstone-{s}.png"), s)
        win[s] = Image.open(p).convert("RGBA")
    write_ico(os.path.join(ICON, "windows", "Inkstone.ico"), win)

    # Web
    web = os.path.join(ICON, "web")
    write(os.path.join(web, "favicon.svg"), brand.favicon_svg())
    fav = {s: Image.open(downscale(m["small_win"] if s <= 32 else m["win"], os.path.join(TMP, f"f{s}.png"), s)).convert("RGBA")
           for s in (16, 32, 48)}
    write_ico(os.path.join(web, "favicon.ico"), fav)
    sq = Image.open(m["square"]).convert("RGB")
    sq.resize((180, 180), Image.LANCZOS).save(os.path.join(web, "apple-touch-icon.png"), optimize=True)
    sq.resize((512, 512), Image.LANCZOS).save(os.path.join(web, "icon-maskable-512.png"), optimize=True)
    for s in (192, 512):
        downscale(m["web"], os.path.join(web, f"icon-{s}.png"), s)
    write(os.path.join(web, "site.webmanifest"), """{
  "name": "Inkstone",
  "short_name": "Inkstone",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#1C1A21",
  "background_color": "#F4F0E6",
  "display": "standalone"
}
""")
    return svg, m


if __name__ == "__main__":
    for d in (LOGO, ICON):
        shutil.rmtree(d, ignore_errors=True)
    build_logos()
    build_icons()
    import sheet
    sheet.build(ROOT)
    shutil.rmtree(TMP, ignore_errors=True)
    print("built ->", ROOT)
