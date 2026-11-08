"""Inkstone brand artwork: palette, mark, wordmarks, lockups and app icons as SVG strings."""
import math
from fontTools.pens.boundsPen import BoundsPen
from geom import fmt, stone_path, well_path, stone_bbox, drop_path, squircle_path, STONE, WELL
import textpath

# ------------------------------------------------------------------ palette
INK = "#1C1A21"        # 墨  ink black, faintly violet like Duan stone
PAPER = "#F4F0E6"      # 宣  rice paper
STONE_GREY = "#76717D" # 石  secondary / captions
VERMILION = "#C8402B"  # 朱  seal red, accent only

WORD = dict(kind="serif", wght=600, text="inkstone", tracking=-6)
ZH = dict(kind="serif", wght=500, text="墨石", tracking=90)


def svg_doc(w, h, body, defs="", title="Inkstone", vb=None):
    vb = vb or f"0 0 {fmt(w)} {fmt(h)}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{fmt(w)}" height="{fmt(h)}" viewBox="{vb}">'
            f'<title>{title}</title>' + (f"<defs>{defs}</defs>" if defs else "") + body + "</svg>\n")


# ------------------------------------------------------------------ mark
def mark_d():
    """Stone with the drop-shaped ink well knocked out (one evenodd path)."""
    return stone_path() + well_path()


def mark_el(x, y, scale, fill=INK):
    return (f'<path transform="translate({fmt(x)} {fmt(y)}) scale({fmt(scale)})" '
            f'fill="{fill}" fill-rule="evenodd" d="{mark_d()}"/>')


def mark_svg(fill=INK, bg=None, pad=0.08, size=1024):
    x0, y0, x1, y1 = stone_bbox()
    w, h = x1 - x0, y1 - y0
    side = max(w, h) * (1 + 2 * pad)
    s = size / side
    ox = (size - w * s) / 2 - x0 * s
    oy = (size - h * s) / 2 - y0 * s
    body = (f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else "") + mark_el(ox, oy, s, fill)
    return svg_doc(size, size, body, title="Inkstone mark")


# ------------------------------------------------------------------ type
def _bounds(kind, wght, ch):
    g, _ = textpath.glyph(kind, wght, ch)
    bp = BoundsPen(textpath.font(kind, wght).getGlyphSet()); g.draw(bp)
    return bp.bounds  # font units, y up


def metrics(kind, wght):
    return dict(xh=_bounds(kind, wght, "x")[3], asc=_bounds(kind, wght, "k")[3])


def wordmark(x, baseline, size, fill=INK, style=WORD, kern=None):
    """Wordmark paths; the i's dot is replaced by an ink drop that echoes the mark.
    Returns (svg, width, metrics_px)."""
    d, adv, info = textpath.text(style["kind"], style["wght"], style["text"], x, baseline, size,
                                 tracking=style["tracking"], kern=kern, drop_i_dot=True)
    out = [f'<path fill="{fill}" d="{d}"/>']
    for inf in info:
        bx0, by0, bx1, by1 = inf["i_dot"]; sc = inf["scale"]
        r = (bx1 - bx0) / 2 * sc * 1.02
        cx = inf["x"] + (bx0 + bx1) / 2 * sc
        cy = baseline - (by0 + by1) / 2 * sc + r * 0.22
        out.append(f'<path fill="{fill}" d="{drop_path(cx, cy, r, L=WELL["L"], rot=WELL["rot"])}"/>')
    m = metrics(style["kind"], style["wght"])
    return "".join(out), adv, {k: v * size / 1000 for k, v in m.items()}


def zh_text(x, baseline, size, fill=INK, style=ZH):
    d, adv, _ = textpath.text(style["kind"], style["wght"], style["text"], x, baseline, size,
                              tracking=style["tracking"])
    # visual extent of the ideographs
    b = [_bounds(style["kind"], style["wght"], ch) for ch in style["text"]]
    top = max(q[3] for q in b) * size / 1000
    bot = min(q[1] for q in b) * size / 1000
    adv -= style["tracking"] * size / 1000  # no trailing tracking
    return f'<path fill="{fill}" d="{d}"/>', adv, top, bot


KERN = {}  # index -> font units, filled after optical review


def _mark_fit(target_h):
    x0, y0, x1, y1 = stone_bbox()
    s = target_h / (y1 - y0)
    return s, (x1 - x0) * s, x0, y0


def lockup_horizontal(fill=INK, zh=True, accent=None, size=200, pad=None):
    """[mark]  inkstone  |  墨石"""
    wm_probe, wadv, m = wordmark(0, 0, size)
    asc, xh = m["asc"], m["xh"]
    mh = asc * 1.34
    s, mw, sx0, sy0 = _mark_fit(mh)
    pad = pad if pad is not None else asc * 0.5
    baseline = pad + (mh + asc) / 2 + asc * 0.02   # word block centred on the mark
    mark_x = pad
    mark_y = baseline - asc / 2 - mh / 2
    parts = [mark_el(mark_x - sx0 * s, mark_y - sy0 * s, s, fill)]
    wx = mark_x + mw + mh * 0.36
    wm, wadv, _ = wordmark(wx, baseline, size, fill, kern=KERN)
    parts.append(wm)
    right = wx + wadv
    if zh:
        gap = size * 0.30
        dx = right + gap
        parts.append(f'<rect x="{fmt(dx)}" y="{fmt(baseline - asc * 0.92)}" width="{fmt(size * 0.012)}" '
                     f'height="{fmt(asc * 0.98)}" fill="{accent or fill}" opacity="{1 if accent else 0.28}"/>')
        zsize = asc * 0.86 / 0.80
        zt, zadv, ztop, zbot = zh_text(0, 0, zsize, fill)
        zx = dx + gap
        zbase = baseline - asc * 0.46 + (ztop + zbot) / 2   # centre ideographs on the word block
        zt, zadv, _, _ = zh_text(zx, zbase, zsize, fill)
        parts.append(zt)
        right = zx + zadv
    W = right + pad
    H = mark_y + mh + pad
    return W, H, "".join(parts)


def lockup_stacked(fill=INK, zh=True, size=200, pad=None):
    """mark above, wordmark centred below, 墨石 spaced beneath."""
    _, wadv, m = wordmark(0, 0, size)
    asc = m["asc"]
    mh = asc * 2.3
    s, mw, sx0, sy0 = _mark_fit(mh)
    pad = pad if pad is not None else asc * 0.6
    W = max(wadv, mw) + 2 * pad
    mark_x = (W - mw) / 2; mark_y = pad
    parts = [mark_el(mark_x - sx0 * s, mark_y - sy0 * s, s, fill)]
    baseline = mark_y + mh + asc * 0.55 + asc
    wm, wadv, _ = wordmark((W - wadv) / 2, baseline, size, fill, kern=KERN)
    parts.append(wm)
    bottom = baseline + size * 0.06
    if zh:
        zsize = size * 0.42
        zt, zadv, ztop, zbot = zh_text(0, 0, zsize, fill, style=dict(ZH, tracking=420))
        zb = baseline + asc * 0.42 + ztop
        zt, zadv, _, _ = zh_text((W - zadv) / 2, zb, zsize, fill, style=dict(ZH, tracking=420))
        parts.append(f'<g opacity="0.82">{zt}</g>')
        bottom = zb - zbot
    H = bottom + pad
    return W, H, "".join(parts)


def lockup_zh(fill=INK, size=200, pad=None):
    """Chinese lockup: [mark] 墨石"""
    zsize = size * 1.25
    zt, zadv, ztop, zbot = zh_text(0, 0, zsize, fill)
    zh_h = ztop - zbot
    mh = zh_h * 1.22
    s, mw, sx0, sy0 = _mark_fit(mh)
    pad = pad if pad is not None else zh_h * 0.4
    mark_x, mark_y = pad, pad
    parts = [mark_el(mark_x - sx0 * s, mark_y - sy0 * s, s, fill)]
    zx = mark_x + mw + mh * 0.34
    zb = mark_y + mh / 2 + (ztop + zbot) / 2
    zt, zadv, _, _ = zh_text(zx, zb, zsize, fill)
    parts.append(zt)
    return zx + zadv + pad, mark_y + mh + pad, "".join(parts)


def seal(size=512, fill=VERMILION, paper=PAPER):
    """Vermilion chop with 墨石 reversed out, set vertically (read top to bottom)."""
    r = size * 0.10
    st = dict(kind="serif", wght=800)
    inner = size * 0.74
    zsize = inner * 0.50
    parts = [f'<rect x="0" y="0" width="{size}" height="{size}" rx="{fmt(r)}" fill="{fill}"/>']
    for i, ch in enumerate("墨石"):
        b = _bounds(st["kind"], st["wght"], ch)
        gw = (b[2] - b[0]) * zsize / 1000; gh = (b[3] - b[1]) * zsize / 1000
        cell_top = size * 0.13 + i * inner / 2
        x = size / 2 - gw / 2 - b[0] * zsize / 1000
        base = cell_top + inner / 4 + gh / 2 + b[1] * zsize / 1000
        d, _, _ = textpath.text(st["kind"], st["wght"], ch, x, base, zsize)
        parts.append(f'<path fill="{paper}" d="{d}"/>')
    return size, size, "".join(parts)


# ------------------------------------------------------------------ app icon
def _icon_mark_transform(cx, cy, stone_w):
    x0, y0, x1, y1 = stone_bbox()
    s = stone_w / (x1 - x0)
    return cx - (x0 + x1) / 2 * s, cy - (y0 + y1) / 2 * s, s


def icon_svg(theme="light", canvas=1024, tile=824, shadow=True, stone_frac=0.70, detail=True, square=False):
    """App icon. tile=824 on 1024 follows the macOS grid; tile=canvas gives a full-bleed tile.
    square=True paints an opaque full square (iOS / Android maskable: the platform rounds it)."""
    if square:
        tile, shadow = canvas, False
    off = (canvas - tile) / 2
    light = theme == "light"
    if light:
        bg0, bg1 = "#FDFBF6", "#EAE3D5"
        st0, st1, st2 = "#45414E", "#232028", "#110F14"
        wl0, wl1, wl2 = "#D9D1C1", "#F3EEE4", "#FFFDF8"
        contact = "#2A2016"; contact_op = 0.42
    else:
        bg0, bg1 = "#2E2B35", "#141217"
        st0, st1, st2 = "#FFFDF8", "#EDE7DA", "#C9C0AE"
        wl0, wl1, wl2 = "#050407", "#18161C", "#2B2832"
        contact = "#000000"; contact_op = 0.7

    stone_w = tile * stone_frac
    cx, cy = canvas / 2, off + tile * 0.485
    tx, ty, s = _icon_mark_transform(cx, cy, stone_w)
    T = f'transform="translate({fmt(tx)} {fmt(ty)}) scale({fmt(s)})"'
    k = tile / 824  # filter sizes scale with the tile
    sq = f"M0 0H{canvas}V{canvas}H0Z" if square else squircle_path(off, off, tile)

    defs = f'''
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg0}"/><stop offset="1" stop-color="{bg1}"/></linearGradient>
<radialGradient id="st" cx="0.33" cy="0.22" r="0.95" fx="0.30" fy="0.18"><stop offset="0" stop-color="{st0}"/><stop offset="0.48" stop-color="{st1}"/><stop offset="1" stop-color="{st2}"/></radialGradient>
<linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{wl0}"/><stop offset="0.5" stop-color="{wl1}"/><stop offset="1" stop-color="{wl2}"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="{0.55 if light else 0.9}"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="tile"><path d="{sq}"/></clipPath>
<clipPath id="stoneClip"><path {T} d="{stone_path()}"/></clipPath>
<clipPath id="wellClip"><path {T} d="{well_path()}"/></clipPath>
<clipPath id="ringClip"><path {T} clip-rule="evenodd" d="{stone_path()}{well_path()}"/></clipPath>
<filter id="tileShadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="{fmt(12*k)}"/><feOffset dy="{fmt(10*k)}"/><feComponentTransfer><feFuncA type="linear" slope="0.30"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{fmt(26*k)}"/></filter>
<filter id="softer" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{fmt(9*k)}"/></filter>
<filter id="sheen" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{fmt(30*k)}"/></filter>
<filter id="inner" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{fmt(5*k)}"/></filter>
'''
    stone_d, well_d = stone_path(), well_path()
    W = WELL
    body = []
    tile_el = f'<path d="{sq}" fill="url(#bg)"/>'
    body.append(f'<g filter="url(#tileShadow)">{tile_el}</g>' if shadow else tile_el)
    g = ['<g clip-path="url(#tile)">']
    if detail:
        # top edge light on the tile
        g.append(f'<path d="{sq}" fill="none" stroke="#fff" stroke-opacity="{0.7 if light else 0.08}" stroke-width="{fmt(3*k)}" transform="translate(0 {fmt(1.5*k)})"/>')
        # soft cast shadow + tight contact shadow under the stone
        g.append(f'<path d="{stone_path()}" fill="{contact}" opacity="{contact_op*0.55}" filter="url(#soft)" transform="translate({fmt(tx + 6*k)} {fmt(ty + 34*k)}) scale({fmt(s)})"/>')
        g.append(f'<path d="{stone_path()}" fill="{contact}" opacity="{contact_op}" filter="url(#softer)" transform="translate({fmt(tx + 2*k)} {fmt(ty + 12*k)}) scale({fmt(s)})"/>')
    g.append(f'<path {T} d="{stone_d}" fill="url(#st)"/>')
    if detail:
        # broad polish sheen, upper left
        bx0, by0, bx1, by1 = stone_bbox()
        g.append(f'<g clip-path="url(#stoneClip)"><ellipse cx="{fmt(tx + (bx0 + (bx1-bx0)*0.30)*s)}" cy="{fmt(ty + (by0 + (by1-by0)*0.16)*s)}" '
                 f'rx="{fmt((bx1-bx0)*0.36*s)}" ry="{fmt((by1-by0)*0.20*s)}" fill="#fff" opacity="{0.16 if light else 0.5}" filter="url(#sheen)" '
                 f'transform="rotate(-14 {fmt(tx + (bx0 + (bx1-bx0)*0.30)*s)} {fmt(ty + (by0 + (by1-by0)*0.16)*s)})"/></g>')
        # rim light along the upper-left edge
        g.append(f'<g clip-path="url(#stoneClip)"><path {T} d="{stone_d}" fill="none" stroke="url(#rim)" stroke-width="{fmt(7*k/s)}"/></g>')
    # the well
    g.append(f'<path {T} d="{well_d}" fill="url(#wl)"/>')
    if detail:
        # recessed: shadow from the upper rim falling into the well
        g.append(f'<g clip-path="url(#wellClip)"><path d="{well_d}" fill="none" stroke="#000" stroke-opacity="{0.30 if light else 0.9}" '
                 f'stroke-width="{fmt(16*k/s)}" filter="url(#inner)" transform="translate({fmt(tx)} {fmt(ty + 9*k)}) scale({fmt(s)})"/></g>')
        # catch light on the lower lip of the well
        g.append(f'<g clip-path="url(#ringClip)"><path d="{well_d}" fill="none" stroke="#fff" stroke-opacity="{0.22 if light else 0.6}" '
                 f'stroke-width="{fmt(4*k/s)}" transform="translate({fmt(tx)} {fmt(ty + 3*k)}) scale({fmt(s)})"/></g>')
    g.append("</g>")
    body.extend(g)
    return svg_doc(canvas, canvas, "".join(body), defs=defs, title="Inkstone app icon")


SMALL_WELL = dict(r=WELL["r"] * 1.17, L=1.92, cy=556, cx=494)


def favicon_svg():
    """Adaptive favicon: ink mark on light UIs, paper mark on dark UIs."""
    d = stone_path() + well_path(**SMALL_WELL)
    x0, y0, x1, y1 = stone_bbox()
    pad = 10
    vb = f"{fmt(x0 - pad)} {fmt(y0 - pad - (x1 - x0 - (y1 - y0)) / 2)} {fmt(x1 - x0 + 2 * pad)} {fmt(x1 - x0 + 2 * pad)}"
    body = (f'<style>path{{fill:{INK}}}@media (prefers-color-scheme:dark){{path{{fill:{PAPER}}}}}</style>'
            f'<path fill-rule="evenodd" d="{d}"/>')
    return svg_doc(32, 32, body, vb=vb, title="Inkstone")


def icon_small_svg(theme="light", canvas=512, tile_frac=0.94):
    """Flat art for 16-32 px: bigger stone, bigger well, no effects, near full-bleed tile."""
    light = theme == "light"
    bg, ink, paper = (PAPER, INK, PAPER) if light else ("#1F1C24", "#F1ECE1", "#1F1C24")
    tile = canvas * tile_frac; off = (canvas - tile) / 2
    sq = squircle_path(off, off, tile, n=4.2)
    x0, y0, x1, y1 = stone_bbox()
    sw = tile * 0.86
    s = sw / (x1 - x0)
    tx = canvas / 2 - (x0 + x1) / 2 * s; ty = canvas / 2 - (y0 + y1) / 2 * s
    well = well_path(**SMALL_WELL)
    body = (f'<path d="{sq}" fill="{bg}"/>'
            f'<path transform="translate({fmt(tx)} {fmt(ty)}) scale({fmt(s)})" fill="{ink}" fill-rule="evenodd" d="{stone_path()}{well}"/>')
    if not light:
        body = body  # well shows the dark tile through the knockout
    return svg_doc(canvas, canvas, body, title="Inkstone app icon (small)")


def icon_layers():
    """Separate layers (1024, full-bleed) for macOS Icon Composer / Android adaptive icons."""
    bg = svg_doc(1024, 1024, f'<rect width="1024" height="1024" fill="url(#bg)"/>',
                 defs='<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDFBF6"/><stop offset="1" stop-color="#EAE3D5"/></linearGradient>',
                 title="Inkstone icon background")
    x0, y0, x1, y1 = stone_bbox()
    s = 1024 * 0.58 / (x1 - x0)
    tx = 512 - (x0 + x1) / 2 * s; ty = 512 - (y0 + y1) / 2 * s
    fg = svg_doc(1024, 1024, mark_el(tx, ty, s, INK), title="Inkstone icon foreground")
    return bg, fg
