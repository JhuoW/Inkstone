"""Glyph outlines from local OFL variable fonts -> SVG path data."""
from functools import lru_cache
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

FONTS = {"sans": r"C:/Windows/Fonts/NotoSansSC-VF.ttf", "serif": r"C:/Windows/Fonts/NotoSerifSC-VF.ttf"}


@lru_cache(None)
def font(kind, wght):
    f = TTFont(FONTS[kind])
    return instantiateVariableFont(f, {"wght": wght}, inplace=False)


def glyph(kind, wght, ch):
    f = font(kind, wght)
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord(ch)]
    return gs[name], f["hmtx"][name][0]


def contours(kind, wght, ch):
    """Return list of RecordingPen value-lists, one per contour."""
    g, adv = glyph(kind, wght, ch)
    rp = RecordingPen(); g.draw(rp)
    out, cur = [], []
    for op, args in rp.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            out.append(cur); cur = []
    return out, adv


def contour_bounds(c):
    bp = BoundsPen(None)
    for op, args in c:
        getattr(bp, op)(*args)
    return bp.bounds


def to_svg(ops_list, x, y, size, upm=1000):
    """Draw contours with origin at (x, baseline y), font size in px."""
    s = size / upm
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    tp = TransformPen(pen, (s, 0, 0, -s, x, y))
    for c in ops_list:
        for op, args in c:
            getattr(tp, op)(*args)
    return pen.getCommands()


def text(kind, wght, s, x, y, size, tracking=0, kern=None, drop_i_dot=False):
    """Return (path_d, advance_px, info). tracking in font units. kern: dict index->units extra."""
    d, cx, info = [], x, []
    for i, ch in enumerate(s):
        cs, adv = contours(kind, wght, ch)
        if drop_i_dot and ch == "i":
            # remove the dot (contour with highest bottom)
            cs_sorted = sorted(cs, key=lambda c: contour_bounds(c)[1])
            dot = cs_sorted[-1]
            info.append({"i_dot": contour_bounds(dot), "x": cx, "scale": size / 1000})
            cs = cs_sorted[:-1]
        d.append(to_svg(cs, cx, y, size))
        cx += (adv + tracking + (kern or {}).get(i, 0)) * size / 1000
    return " ".join(d), cx - x, info
