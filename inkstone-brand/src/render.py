"""Rasterise SVG with headless Chrome (exact, transparent), downscale with Pillow."""
import os, re, subprocess, tempfile, shutil
from PIL import Image

CHROME_CANDIDATES = [
    r"C:/Program Files/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "chromium",
]


def chrome():
    for c in CHROME_CANDIDATES:
        if os.path.exists(c) or shutil.which(c):
            return c
    raise SystemExit("Chrome/Edge not found")


def svg_size(svg_text):
    m = re.search(r'<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"', svg_text)
    return float(m.group(1)), float(m.group(2))


def render_svg(svg_text, out_png, width=None):
    """Render svg_text to out_png at `width` px wide (keeps aspect)."""
    w, h = svg_size(svg_text)
    width = width or w
    scale = width / w
    W, H = round(w * scale), round(h * scale)
    # set the outer size so the browser rasterises natively at target resolution
    svg_text = re.sub(r'(<svg[^>]*?)\swidth="[\d.]+"', rf'\1 width="{W}"', svg_text, count=1)
    svg_text = re.sub(r'(<svg[^>]*?)\sheight="[\d.]+"', rf'\1 height="{H}"', svg_text, count=1)
    tmp = tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8")
    tmp.write(svg_text); tmp.close()
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--default-background-color=00000000", "--force-device-scale-factor=1",
                    f"--window-size={W},{H}", f"--screenshot={os.path.abspath(out_png)}",
                    "file:///" + tmp.name.replace("\\", "/")], capture_output=True, check=True)
    os.unlink(tmp.name)
    return out_png


def downscale(src_png, out_png, size):
    """High-quality premultiplied-alpha downscale to a square `size`."""
    im = Image.open(src_png).convert("RGBA").convert("RGBa")
    im = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    im.save(out_png, optimize=True)
    return out_png
