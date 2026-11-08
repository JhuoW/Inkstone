"""Contact sheet for design review (not part of the deliverables)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand
from brand import svg_doc, PAPER, INK
from render import render_svg, downscale
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "review"
os.makedirs(OUT, exist_ok=True)


def save(name, svg, width):
    p = os.path.join(OUT, name + ".png")
    render_svg(svg, p, width)
    return p


def lock(fn, bg=PAPER, **kw):
    W, H, body = fn(**kw)
    return svg_doc(W, H, f'<rect width="100%" height="100%" fill="{bg}"/>' + body)


save("h", lock(brand.lockup_horizontal), 1400)
save("h_dark", lock(brand.lockup_horizontal, bg=INK, fill=PAPER), 1400)
save("stack", lock(brand.lockup_stacked), 600)
save("zh", lock(brand.lockup_zh), 700)
save("seal", lock(brand.seal), 200)
save("icon_l", brand.icon_svg("light"), 512)
save("icon_d", brand.icon_svg("dark"), 512)
big = save("icon_small_src", brand.icon_small_svg("light"), 512)
for s in (16, 32):
    downscale(big, os.path.join(OUT, f"icon_{s}.png"), s)
    Image.open(os.path.join(OUT, f"icon_{s}.png")).resize((s * 8, s * 8), Image.NEAREST).save(os.path.join(OUT, f"icon_{s}_zoom.png"))
l = save("icon_l1024", brand.icon_svg("light"), 1024)
for s in (64, 128):
    downscale(l, os.path.join(OUT, f"icon_l_{s}.png"), s)
print("ok")
