"""Geometry for the Inkstone mark. All shapes are generated, so the mark is exactly reproducible.

Mark space is a 1000 x 1000 box. Everything else is placed by transform.
"""
import math


def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def smooth_closed(pts):
    """Closed Catmull-Rom spline through pts, emitted as cubic Beziers."""
    n = len(pts)
    d = [f"M{fmt(pts[0][0])} {fmt(pts[0][1])}"]
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}")
    return "".join(d) + "Z"


def _rot(x, y, deg):
    r = math.radians(deg)
    return x * math.cos(r) - y * math.sin(r), x * math.sin(r) + y * math.cos(r)


# ---------------------------------------------------------------- stone
STONE = dict(cx=500, cy=512, w=690, h=572, n=2.3, taper=0.075, rot=-8, egg=0.035)
WELL = dict(cx=489, cy=489, r=116, L=1.84, rot=-8)


def stone_points(cx, cy, w, h, n, taper, rot, egg, npts=64, grow=0.0):
    """Polished river-stone outline: a soft superellipse, slightly wider at the base,
    with a faint egg asymmetry, resting at a gentle tilt."""
    pts = []
    a, b = w / 2 + grow, h / 2 + grow
    for i in range(npts):
        t = 2 * math.pi * i / npts
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        x *= 1 + taper * (y / b)            # fuller base
        y *= 1 + egg * (x / a)              # right side a touch deeper
        x, y = _rot(x, y, rot)
        pts.append((cx + x, cy + y))
    return pts


def stone_path(**over):
    p = dict(STONE); p.update(over)
    return smooth_closed(stone_points(**p))


def stone_bbox(**over):
    p = dict(STONE); p.update(over)
    pts = stone_points(npts=360, **p)
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------- drop
def drop_path(cx, cy, r, L=1.84, rot=0.0, a=0.40, b=0.60, c=0.80):
    """Ink drop: round belly (radius r, centred at cx,cy) and a tip L*r above the centre."""
    def T(x, y):
        x, y = _rot(x, y, rot)
        return f"{fmt(cx + x)} {fmt(cy + y)}"
    tip = (0, -L * r)
    return (f"M{T(*tip)}"
            f"C{T(a * r, -L * r + b * r)} {T(r, -c * r)} {T(r, 0)}"
            f"A{fmt(r)} {fmt(r)} 0 0 1 {T(-r, 0)}"
            f"C{T(-r, -c * r)} {T(-a * r, -L * r + b * r)} {T(*tip)}Z")


def well_path(**over):
    p = dict(WELL); p.update(over)
    return drop_path(**p)


# ---------------------------------------------------------------- squircle
def squircle_path(x, y, size, n=5.0, npts=180):
    """Continuous-corner (superellipse) tile, close to the macOS / iOS icon shape."""
    h = size / 2
    pts = []
    for i in range(npts):
        t = 2 * math.pi * i / npts
        c, s = math.cos(t), math.sin(t)
        pts.append((x + h + h * math.copysign(abs(c) ** (2 / n), c),
                    y + h + h * math.copysign(abs(s) ** (2 / n), s)))
    return smooth_closed(pts)
