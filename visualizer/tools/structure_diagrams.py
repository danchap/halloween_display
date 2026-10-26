#!/usr/bin/env python3
"""Draw the spider's support structure as SVG files from a JSON description.

Usage:
  python3 structure_diagrams.py data.json outdir/ [--scale 120]
  python3 structure_diagrams.py --from-parts parts.json data.json

The first form writes plan.svg, elevation-R.svg, elevation-L.svg and
joints.svg into outdir (created if needed). The second form writes the
data file from the page's parts dump (the JSON the Numbers panel saves,
with its feet, legs, skis and body), so the diagrams follow the design.

The alley frame: x runs along the alley from the street (small x) into
the dead end (large x), z across. R is +z, the right-hand wall when you
look in from the street (the garage side); L is -z (the east house, with
the plaque at its street corner at x = 2.07). Lengths in metres.

data.json:
{
  "walls": { "R": 1.428, "L": -1.459 },          wall lines (z)
  "lWallCorner": 2.07,                            the plaque corner (x)
  "body": { "along": 6.5, "length": 0.80, "width": 0.40 },
  "skis": [
    { "side": "R", "z": 1.4, "from": 4.322, "to": 7.59,
      "tees": [ { "leg": "1R", "x": 4.472, "post": 3.758,
                  "postHeight": 3.793, "footHeight": 3.833 }, ... ] },
    { "side": "L", ... }
  ],
  "xRange": [3.5, 9.5]                             optional, the drawn stretch
}

Each SVG has a viewBox and a width and height in pixels, uses the system
font, black lines on white, and no external resource. Element ids are
prefixed with the file's name, so several of them can sit in one HTML
page.
"""

import argparse
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as xesc

FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
GREY = '#666'
FAINT = '#e2e2e2'


def m3(v):
    return f'{v:.3f}'


def num(v):
    """A compact number for an attribute."""
    s = f'{v:.2f}'
    return s.rstrip('0').rstrip('.') if '.' in s else s


def text_width(s, size):
    """A rough width of a string in the system font, for placing labels."""
    w = 0.0
    for ch in s:
        if ch.isdigit():
            w += 0.56
        elif ch in ' .,:;\'':
            w += 0.28
        elif ch in 'iljtfI':
            w += 0.3
        elif ch.isupper() or ch in 'mw':
            w += 0.72
        else:
            w += 0.54
    return w * size


class Svg:
    """A small SVG writer. Coordinates are pixels, y down."""

    def __init__(self, width, height, name):
        self.w = width
        self.h = height
        self.name = name
        self.items = []

    def add(self, s):
        self.items.append(s)

    def line(self, x1, y1, x2, y2, width=1, color='#000', dash=None, cap='butt'):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<line x1="{num(x1)}" y1="{num(y1)}" x2="{num(x2)}" y2="{num(y2)}" '
                 f'stroke="{color}" stroke-width="{num(width)}" stroke-linecap="{cap}"{d}/>')

    def rect(self, x, y, w, h, fill='#fff', stroke='#000', width=1, rx=0):
        r = f' rx="{num(rx)}"' if rx else ''
        self.add(f'<rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{num(width)}"{r}/>')

    def circle(self, cx, cy, r, fill='#fff', stroke='#000', width=1):
        self.add(f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{num(width)}"/>')

    def polyline(self, pts, color='#000', width=1, dash=None, fill='none'):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        p = ' '.join(f'{num(x)},{num(y)}' for x, y in pts)
        self.add(f'<polyline points="{p}" fill="{fill}" stroke="{color}" '
                 f'stroke-width="{num(width)}" stroke-linejoin="round"{d}/>')

    def polygon(self, pts, fill='#000', stroke='none'):
        p = ' '.join(f'{num(x)},{num(y)}' for x, y in pts)
        self.add(f'<polygon points="{p}" fill="{fill}" stroke="{stroke}"/>')

    def text(self, x, y, s, size=12, anchor='start', weight=None, color='#000',
             halo=False, rotate=None, italic=False):
        attrs = [f'x="{num(x)}"', f'y="{num(y)}"', f'font-size="{num(size)}"']
        if anchor != 'start':
            attrs.append(f'text-anchor="{anchor}"')
        if weight:
            attrs.append(f'font-weight="{weight}"')
        if italic:
            attrs.append('font-style="italic"')
        if color != '#000':
            attrs.append(f'fill="{color}"')
        if halo:
            attrs.append('paint-order="stroke" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"')
        if rotate is not None:
            attrs.append(f'transform="rotate({num(rotate)} {num(x)} {num(y)})"')
        self.add(f'<text {" ".join(attrs)}>{xesc(s)}</text>')

    def arrow_head(self, x, y, dx, dy, size=7, color='#000'):
        """A filled triangle with its tip at (x, y), pointing along (dx, dy)."""
        n = math.hypot(dx, dy) or 1
        ux, uy = dx / n, dy / n
        px, py = -uy, ux
        b = size * 0.4
        self.polygon([(x, y), (x - ux * size + px * b, y - uy * size + py * b),
                      (x - ux * size - px * b, y - uy * size - py * b)], fill=color)

    def dim_h(self, x1, x2, y, label, label_below=False, size=12, color='#000'):
        """A horizontal dimension line between x1 and x2 with the label at
        its middle. Short spans get their arrows outside."""
        if x2 < x1:
            x1, x2 = x2, x1
        span = x2 - x1
        self.line(x1, y, x2, y, 0.9, color)
        if span >= 26:
            self.arrow_head(x1, y, -1, 0, color=color)
            self.arrow_head(x2, y, 1, 0, color=color)
        else:
            self.line(x1 - 14, y, x1, y, 0.9, color)
            self.line(x2, y, x2 + 14, y, 0.9, color)
            self.arrow_head(x1, y, 1, 0, color=color)
            self.arrow_head(x2, y, -1, 0, color=color)
        ty = y + size + 2 if label_below else y - 4
        self.text((x1 + x2) / 2, ty, label, size, 'middle', halo=True, color=color)

    def dim_v(self, x, y1, y2, label, size=12, color='#000', side='left'):
        """A vertical dimension line with a rotated label beside it."""
        if y2 < y1:
            y1, y2 = y2, y1
        self.line(x, y1, x, y2, 0.9, color)
        self.arrow_head(x, y1, 0, -1, color=color)
        self.arrow_head(x, y2, 0, 1, color=color)
        tx = x - 5 if side == 'left' else x + size + 1
        self.text(tx, (y1 + y2) / 2, label, size, 'middle', halo=True, rotate=-90, color=color)

    def arc(self, cx, cy, r, a1, a2, color='#000', width=1, arrow=False):
        """An arc from angle a1 to a2 (degrees, counter-clockwise from +x
        with y up, as on a protractor), with an arrowhead at its end."""
        steps = max(8, int(abs(a2 - a1) / 4))
        pts = []
        for i in range(steps + 1):
            a = math.radians(a1 + (a2 - a1) * i / steps)
            pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
        self.polyline(pts, color, width)
        if arrow:
            (xa, ya), (xb, yb) = pts[-2], pts[-1]
            self.arrow_head(xb, yb, xb - xa, yb - ya, 6, color)

    def note(self, x, y, s, width_px, size=11.5, color=GREY):
        """A grey note wrapped to width_px. Returns the y below it."""
        for line in wrap(s, int(width_px / (size * 0.5))):
            self.text(x, y, line, size, color=color)
            y += size + 3
        return y

    def xml(self):
        body = '\n'.join(self.items)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(self.w)}" height="{num(self.h)}" '
            f'viewBox="0 0 {num(self.w)} {num(self.h)}" font-family=\'{FONT}\' font-size="12">\n'
            f'<rect id="{self.name}-bg" width="{num(self.w)}" height="{num(self.h)}" fill="#fff"/>\n'
            f'{body}\n</svg>\n')


# ------------------------------------------------------------------ plan

def draw_plan(d, S):
    x0, x1 = d.get('xRange', [3.5, 9.5])
    wall_r, wall_l = d['walls']['R'], d['walls']['L']
    ml = 28
    mr = 28
    w = ml + (x1 - x0) * S + mr
    y_centre = 26 + 24 + abs(wall_l) * S

    def X(x):
        return ml + (x - x0) * S

    def Y(z):
        return y_centre + z * S

    y_r, y_l = Y(wall_r), Y(wall_l)
    notes = ('Ski dimensions run from the ski’s street end to each tee’s centre; the last one is the ski’s length. '
             'The tees carry the posts. The black dot is the head end of the body. '
             'x: metres along the alley from the street mouth, as on the page.')
    note_lines = len(wrap(notes, int((w - ml - mr) / (11.5 * 0.5))))
    h = y_r + 62 + 14.5 * note_lines
    svg = Svg(w, h, 'plan')

    svg.text(ml, 17, 'Plan view, looking down: the street to the left, the dead end to the right', 14, weight='bold')
    svg.text(w - mr, 17, 'dimensions in metres', 12, 'end', color=GREY)

    # The lane: centreline, walls, x ticks.
    svg.line(X(x0), Y(0), X(x1), Y(0), 0.8, '#999', dash='6 4')
    svg.line(X(x0), y_l, X(x1), y_l, 5)
    svg.line(X(x0), y_r, X(x1), y_r, 5)
    svg.text(X(x1), y_l - 8, f'L wall: the east house (the plaque at its street corner, x = {num(d.get("lWallCorner", 2.07))})', 12, 'end')
    svg.text(X(x1), y_r + 40, 'R wall: the garage side', 12, 'end')
    first = True
    for xi in range(math.ceil(x0), math.floor(x1) + 1):
        svg.line(X(xi), y_r + 2.5, X(xi), y_r + 9, 1)
        svg.text(X(xi), y_r + 21, (f'x = {xi}' if first else str(xi)), 11, 'middle', color=GREY)
        first = False
    svg.text(X(x0) + 8, Y(0) + 4, '← street', 13)
    svg.text(X(x1 - 1.05), Y(0) + 4, 'dead end →', 13, 'end')

    # The body: a capsule on the centreline, the head toward the street.
    b = d['body']
    bl, bw = b['length'], b['width']
    svg.rect(X(b['along'] - bl / 2), Y(-bw / 2), bl * S, bw * S, '#eee', '#000', 1, rx=bw * S / 2)
    svg.circle(X(b['along'] - bl / 2 + 0.09), Y(0), 3, '#000', 'none')
    svg.text(X(b['along'] + 0.06), Y(0) + 4, 'body', 12, 'middle')

    # The skis, their tees and the dimension stacks.
    for ski in d['skis']:
        sign = -1 if ski['side'] == 'R' else 1   # which way the stack grows on screen
        z = ski['z']
        yb = Y(z)
        bar = max(6, 0.05 * S)
        svg.rect(X(ski['from']), yb - bar / 2, (ski['to'] - ski['from']) * S, bar, '#ddd', '#000', 1)
        tees = sorted(ski['tees'], key=lambda t: t['x'])
        for t in tees:
            svg.rect(X(t['x']) - 5, yb - 5, 10, 10, '#fff', '#000', 1.2)
            ty = yb - 11 if sign < 0 else yb + 21
            svg.text(X(t['x']), ty, t['leg'], 13, 'middle', weight='bold')
        rows = [(t['x'], m3(t['x'] - ski['from'])) for t in tees]
        rows.append((ski['to'], m3(ski['to'] - ski['from']) + ' overall'))
        pitch = 20
        y_rows = [yb + sign * (36 + pitch * k) for k in range(len(rows))]
        # extension lines first, so the labels' halos cover them
        svg.line(X(ski['from']), yb + sign * bar / 2, X(ski['from']), y_rows[-1] + sign * 4, 0.7, '#555')
        for (xx, _), yr in zip(rows, y_rows):
            svg.line(X(xx), yb + sign * bar / 2, X(xx), yr + sign * 4, 0.7, '#555')
        for (xx, label), yr in zip(rows, y_rows):
            svg.dim_h(X(ski['from']), X(xx), yr, label, label_below=(sign > 0))

    # Across: between the ski centres and between the walls.
    by_side = {s['side']: s for s in d['skis']}
    xa, xb = x1 - 0.85, x1 - 0.35
    if 'R' in by_side and 'L' in by_side:
        zr, zl = by_side['R']['z'], by_side['L']['z']
        for s in (by_side['R'], by_side['L']):
            svg.line(X(s['to']), Y(s['z']), X(xa) + 6, Y(s['z']), 0.7, '#555')
        svg.dim_v(X(xa), Y(zr), Y(zl), f'{m3(zr - zl)} between the ski centres')
    svg.dim_v(X(xb), y_r, y_l, f'{m3(wall_r - wall_l)} between the walls')

    # The plaque corner, for setting out the L ski.
    if 'L' in by_side and d.get('lWallCorner') is not None:
        s = by_side['L']
        dist = s['from'] - d['lWallCorner']
        y = Y(s['z']) + 14
        svg.line(X(s['from']), y, X(s['from']) - 40, y, 0.9)
        svg.arrow_head(X(s['from']) - 40, y, -1, 0)
        svg.text(X(s['from']) - 46, y + 4, f'{m3(dist)} m to the plaque', 12, 'end')
        svg.text(X(s['from']) - 46, y + 18, f'corner at x = {num(d["lWallCorner"])}', 12, 'end')

    svg.note(ml, y_r + 62, notes, w - ml - mr)
    return svg


# ------------------------------------------------------------- elevation

def draw_elevation(d, side, S):
    x0, x1 = d.get('xRange', [3.5, 9.5])
    ski = next(s for s in d['skis'] if s['side'] == side)
    mirror = side == 'R'      # facing the R wall from the alley, the street is on the right
    ml, mr = 40, 28
    w = ml + (x1 - x0) * S + mr
    top = max(t['footHeight'] for t in ski['tees']) + 0.45
    y_ground = 26 + 12 + top * S
    notes = ('Post: the pipe’s cut length. Foot: the top of the foot set above the lane. '
             'Spacings are between tee centres along the ski, from its street end to its far end.')
    note_lines = len(wrap(notes, int((w - ml - mr) / (11.5 * 0.5))))
    h = y_ground + 104 + 14.5 * note_lines
    svg = Svg(w, h, f'elevation-{side}')

    def X(x):
        return ml + ((x1 - x) if mirror else (x - x0)) * S

    def Y(height):
        return y_ground - height * S

    if side == 'R':
        svg.text(ml, 17, 'R wall (the garage side) seen from the alley: the street is on the right', 14, weight='bold')
    else:
        svg.text(ml, 17, 'L wall (the east house) seen from the alley: the street is on the left', 14, weight='bold')
    svg.text(w - mr, 17, 'dimensions in metres', 12, 'end', color=GREY)

    # The 1 m grid and its labels.
    for xi in range(math.ceil(x0), math.floor(x1) + 1):
        svg.line(X(xi), Y(top), X(xi), y_ground, 0.8, FAINT)
    for hi in range(1, math.floor(top) + 1):
        svg.line(X(x0), Y(hi), X(x1), Y(hi), 0.8, FAINT)
        svg.text(ml - 5, Y(hi) + 4, f'{hi} m', 11, 'end', color=GREY)
    first = True
    for xi in range(math.ceil(x0), math.floor(x1) + 1):
        svg.text(X(xi), y_ground + 14, (f'x = {xi}' if first else str(xi)), 11, 'middle', color=GREY, halo=True)
        first = False

    # The lane, with the street and the dead end marked.
    svg.line(X(x0), y_ground, X(x1), y_ground, 3)
    left, right = ('dead end', 'street') if mirror else ('street', 'dead end')
    svg.text(ml + 4, y_ground - 8, f'← {left}', 13)
    svg.text(w - mr - 4, y_ground - 8, f'{right} →', 13, 'end')

    # The ski on the lane.
    xa, xb = sorted((X(ski['from']), X(ski['to'])))
    bar = max(6, 0.05 * S)
    svg.rect(xa, y_ground - bar, xb - xa, bar, '#ddd', '#000', 1)

    tees = sorted(ski['tees'], key=lambda t: t['x'])
    posts = [(X(t['x']), Y(t['footHeight']), t) for t in tees]

    # Posts first, then their labels on the side with room.
    for px, py, t in posts:
        svg.rect(px - 3, py, 6, y_ground - bar - py, '#c8c8c8', '#000', 1)
        svg.rect(px - 5, y_ground - bar - 5, 10, 10, '#fff', '#000', 1.2)
        svg.circle(px, py, 4, '#fff', '#000', 1.2)
    block_h = 44
    for px, py, t in posts:
        lines = [t['leg'], f'post {m3(t["post"])} m', f'foot at {m3(t["footHeight"])} m']
        width = max(text_width(l, 12) for l in lines) + 12

        def clear(xlo, xhi):
            for qx, qy, _ in posts:
                if qx == px:
                    continue
                if xlo <= qx <= xhi and qy < py + block_h:
                    return False
            return True
        ytop = py - 6
        if clear(px + 4, px + width):
            x, anchor = px + 9, 'start'
        elif clear(px - width, px - 4):
            x, anchor = px - 9, 'end'
        else:
            x, anchor, ytop = px, 'middle', py - 10 - block_h
        for i, l in enumerate(lines):
            svg.text(x, ytop + 4 + 14 * i, l, 13 if i == 0 else 12, anchor,
                     weight='bold' if i == 0 else None, halo=True)

    # Spacings along the ski (between tee centres, the ends included) and
    # the ski's length, below the lane.
    y1, y2 = y_ground + 38, y_ground + 66
    xs = [ski['from']] + [t['x'] for t in tees] + [ski['to']]
    for xx in xs:
        svg.line(X(xx), y_ground - bar, X(xx), y2 + 4, 0.7, '#555')
    # A label goes below its span when the span is wide enough, else above
    # it, else below or higher up, wherever it meets no placed label.
    placed = []
    for a, b in zip(xs, xs[1:]):
        pa, pb = sorted((X(a), X(b)))
        label = m3(b - a)
        tw = text_width(label, 12) + 6
        cx = (pa + pb) / 2
        rows = [y1 + 14, y1 - 4, y1 - 18] if pb - pa >= tw + 8 else [y1 - 4, y1 + 14, y1 - 18]
        ty = rows[-1]
        for row in rows:
            if all(not (abs(cx - qx) < (tw + qw) / 2 and row == qy) for qx, qy, qw in placed):
                ty = row
                break
        placed.append((cx, ty, tw))
        svg.line(pa, y1, pb, y1, 0.9)
        if pb - pa >= 26:
            svg.arrow_head(pa, y1, -1, 0)
            svg.arrow_head(pb, y1, 1, 0)
        else:
            svg.arrow_head(pa, y1, 1, 0)
            svg.arrow_head(pb, y1, -1, 0)
        svg.text(cx, ty, label, 12, 'middle', halo=True)
    svg.dim_h(xa, xb, y2, f'{m3(ski["to"] - ski["from"])} overall (the ski)', label_below=True)

    svg.note(ml, y_ground + 104, notes, w - ml - mr)
    return svg


# ---------------------------------------------------------------- joints

def draw_joints():
    w, h = 820, 590
    svg = Svg(w, h, 'joints')
    svg.text(24, 20, 'One leg, seen from the street: the three joints and the sign of each angle', 14, weight='bold')

    hub = (112, 268)
    hip = (222, 268)
    up_a, up_len = 52, 185       # the upper's direction, degrees above the stub
    lo_a, lo_len = -25, 205      # the lower's direction, degrees from horizontal
    knee = (hip[0] + up_len * math.cos(math.radians(up_a)), hip[1] - up_len * math.sin(math.radians(up_a)))
    foot = (knee[0] + lo_len * math.cos(math.radians(lo_a)), knee[1] - lo_len * math.sin(math.radians(lo_a)))
    ground = 352

    def along(p, a, dist):
        return (p[0] + dist * math.cos(math.radians(a)), p[1] - dist * math.sin(math.radians(a)))

    # The lane, the ski, the tee.
    svg.line(430, ground, 640, ground, 3)
    svg.rect(462, ground - 6, 112, 6, '#ddd', '#000', 1)
    svg.rect(foot[0] - 5, ground - 11, 10, 10, '#fff', '#000', 1.2)
    svg.text(518, ground + 18, 'ski on the lane, with the tee', 12, 'middle', color=GREY)

    # Extension lines (dashed) that the bends are measured from.
    for p, a in ((hip, 0), (knee, up_a), (foot, lo_a)):
        q = along(p, a, 66)
        svg.line(p[0], p[1], q[0], q[1], 0.9, '#777', dash='5 4')

    # The tubes.
    svg.line(hub[0], hub[1], hip[0], hip[1], 6, '#333', cap='round')
    svg.line(hip[0], hip[1], knee[0], knee[1], 6, '#333', cap='round')
    svg.line(knee[0], knee[1], foot[0], foot[1], 6, '#333', cap='round')
    svg.line(foot[0], foot[1], foot[0], ground - 6, 6, '#333', cap='round')
    # The hub, the three sets.
    svg.circle(hub[0], hub[1], 15, '#fff', '#000', 1.5)
    svg.circle(hub[0], hub[1], 4, '#000', 'none')
    for p in (hip, knee, foot):
        svg.circle(p[0], p[1], 7.5, '#fff', '#000', 1.5)

    # The three bends, as arcs from the extension line to the next tube.
    svg.arc(hip[0], hip[1], 44, 0, up_a, arrow=True)
    svg.arc(knee[0], knee[1], 38, up_a, lo_a, arrow=True)
    svg.arc(foot[0], foot[1], 38, lo_a, -90, arrow=True)

    # The three turns, as ring arrows about the tubes. The arrow runs the
    # way a point on the tube's near side moves for a positive turn:
    # clockwise when seen from the body end of the tube.
    def ring(c, ux, uy, label_at):
        n = math.hypot(ux, uy)
        ux, uy = ux / n, uy / n
        qx, qy = uy, -ux
        a, b = 20, 6
        back = [(c[0] + a * math.cos(t) * qx + b * math.sin(t) * ux,
                 c[1] + a * math.cos(t) * qy + b * math.sin(t) * uy)
                for t in [math.pi * i / 16 for i in range(17)]]
        svg.polyline(back, '#000', 1, dash='3 3')
        front = []
        for i in range(21):
            t = math.pi + (math.pi - 0.5) * i / 20
            front.append((c[0] + a * math.cos(t) * qx + b * math.sin(t) * ux,
                          c[1] + a * math.cos(t) * qy + b * math.sin(t) * uy))
        svg.polyline(front, '#000', 1.4)
        (xa, ya), (xb, yb) = front[-2], front[-1]
        svg.arrow_head(xb, yb, xb - xa, yb - ya, 7)
        return (c[0] + a * qx * label_at, c[1] + a * qy * label_at)

    stub_ring = ((hub[0] + hip[0]) / 2 - 6, hub[1])
    ring(stub_ring, 1, 0, 1)
    up_ring = (hip[0] + 0.68 * (knee[0] - hip[0]), hip[1] + 0.68 * (knee[1] - hip[1]))
    ring(up_ring, knee[0] - hip[0], knee[1] - hip[1], 1)
    lo_ring = (knee[0] + 0.66 * (foot[0] - knee[0]), knee[1] + 0.66 * (foot[1] - knee[1]))
    ring(lo_ring, foot[0] - knee[0], foot[1] - knee[1], 1)

    # Names of the parts.
    svg.text(hub[0] - 22, hub[1] + 4, 'hub', 12, 'end', italic=True, color=GREY)
    svg.text(hub[0] + 24, hub[1] + 34, 'stub, straight across the alley', 12, italic=True, color=GREY)
    svg.text(hip[0] - 10, hip[1] - 12, 'hip set', 12, 'end', italic=True, color=GREY)
    um = along(hip, up_a, 0.36 * up_len)
    svg.text(um[0] - 12, um[1] - 2, 'upper', 12, 'end', italic=True, color=GREY)
    svg.text(knee[0] - 12, knee[1] - 8, 'knee set', 12, 'end', italic=True, color=GREY)
    lm = along(knee, lo_a, 0.3 * lo_len)
    svg.text(lm[0] + 4, lm[1] - 12, 'lower', 12, 'middle', italic=True, color=GREY)
    svg.text(foot[0] + 12, foot[1] - 9, 'foot set', 12, italic=True, color=GREY)
    svg.text(foot[0] + 10, ground - 40, 'post, plumb', 12, italic=True, color=GREY)

    # Numbered callouts.
    def callout(n, x, y, label, anchor='start'):
        cx = x if anchor == 'start' else x - text_width(label, 12) - 14
        if anchor == 'start':
            tx = x + 20
        else:
            tx = x
            cx = x - text_width(label, 12) - 12
        svg.circle(cx + 8, y - 4, 8, '#000', 'none')
        svg.text(cx + 8, y, str(n), 11, 'middle', weight='bold', color='#fff')
        svg.text(tx if anchor == 'start' else cx + 22, y, label, 12, weight='600', halo=True)

    callout(1, along(hip, up_a / 2, 54)[0], along(hip, up_a / 2, 54)[1] + 4, 'hip angle')
    callout(2, stub_ring[0] - 48, hub[1] - 32, 'hip turn')
    kb = along(knee, (up_a + lo_a) / 2, 52)
    callout(3, kb[0], kb[1] + 4, 'knee bend')
    callout(4, up_ring[0] - 110, up_ring[1] - 8, 'knee roll')
    fb = along(foot, (lo_a - 90) / 2, 50)
    callout(5, fb[0], fb[1] + 4, 'foot bend')
    callout(6, lo_ring[0] - 20, lo_ring[1] - 34, 'foot roll')

    # Directions, at the top right where nothing else is drawn.
    dx = 630
    svg.line(dx, 106, dx, 60, 1.2)
    svg.arrow_head(dx, 60, 0, -1)
    svg.text(dx + 8, 68, 'up', 12)
    svg.circle(dx, 132, 7, '#fff', '#000', 1.2)
    svg.circle(dx, 132, 2, '#000', 'none')
    svg.text(dx + 12, 136, 'toward the head and the street:', 12)
    svg.text(dx + 12, 150, 'out of the page, toward you', 12)

    # The legend: what each number means.
    legend = [
        'hip angle: between the stub and the upper',
        'hip turn: the upper’s plane turned about the stub, 0 = toward the head, positive = up',
        'knee bend: the lower turned off the upper’s line',
        'knee roll: the knee’s plane turned about the upper, from the hip’s plane, positive = clockwise seen from the hip looking toward the knee',
        'foot bend: between the lower and the post',
        'foot roll: the foot’s plane about the lower, from the knee’s plane, same sense',
    ]
    y = 408
    for i, line in enumerate(legend, 1):
        svg.circle(32, y - 4, 8, '#000', 'none')
        svg.text(32, y, str(i), 11, 'middle', weight='bold', color='#fff')
        for k, part in enumerate(wrap(line, 108)):
            svg.text(48, y, part, 12)
            y += 17
        y += 3
    svg.text(24, h - 10, 'The three joints are drawn in one plane; the turns move them out of it. Each ring arrow shows the positive sense of its turn, '
             'as seen from this side.', 11.5, color=GREY)
    return svg


def wrap(s, width):
    words = s.split(' ')
    lines, cur = [], ''
    for wd in words:
        if cur and len(cur) + 1 + len(wd) > width:
            lines.append(cur)
            cur = wd
        else:
            cur = (cur + ' ' + wd) if cur else wd
    if cur:
        lines.append(cur)
    return lines


# ------------------------------------------------------------ data file

def from_parts(parts):
    """The diagram data from the page's parts dump."""
    feet = parts['feet']
    legs = parts['legs']
    walls = {}
    for f in feet:
        walls[f['leg'][-1]] = f['foot'][2]
    body = parts['body']
    skis = []
    for s in parts['skis']:
        tees = []
        for x in s['posts']:
            match = [(i, f) for i, f in enumerate(feet)
                     if f['leg'].endswith(s['side']) and abs(f['foot'][0] - x) < 0.0015]
            if not match:
                raise SystemExit(f'no foot at x = {x} on the {s["side"]} ski')
            i, f = match[0]
            l = legs[i]
            tees.append({'leg': f['leg'], 'x': x, 'post': l['post'],
                         'postHeight': l['postHeight'], 'footHeight': f['foot'][1]})
        skis.append({'side': s['side'], 'z': s['z'], 'from': s['from'], 'to': s['to'], 'tees': tees})
    return {
        'walls': {'R': walls.get('R'), 'L': walls.get('L')},
        'lWallCorner': 2.07,
        'body': {'along': body['along'],
                 'length': round(body['headLength'] + body['abdomenLength'], 3),
                 'width': round(body['abdomenWidth'], 3)},
        'skis': skis,
    }


def main():
    ap = argparse.ArgumentParser(description='Draw the support structure as SVG files.')
    ap.add_argument('data', help='data.json (or, with --from-parts, the parts dump to convert)')
    ap.add_argument('out', help='the output directory (or, with --from-parts, the data file to write)')
    ap.add_argument('--scale', type=float, default=120, help='pixels per metre (default 120)')
    ap.add_argument('--from-parts', action='store_true', help='write the data file from the page\'s parts dump')
    args = ap.parse_args()

    with open(args.data, encoding='utf-8') as f:
        data = json.load(f)
    if args.from_parts:
        out = from_parts(data)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1)
        print(f'{args.out}: {len(out["skis"])} skis, {sum(len(s["tees"]) for s in out["skis"])} tees')
        return

    os.makedirs(args.out, exist_ok=True)
    drawings = {
        'plan.svg': draw_plan(data, args.scale),
        'elevation-R.svg': draw_elevation(data, 'R', args.scale),
        'elevation-L.svg': draw_elevation(data, 'L', args.scale),
        'joints.svg': draw_joints(),
    }
    for name, svg in drawings.items():
        xml = svg.xml()
        ET.fromstring(xml.encode('utf-8'))      # raises if the file is not well-formed
        path = os.path.join(args.out, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(xml)
        print(f'{path}: {int(svg.w)} x {int(svg.h)} px')


if __name__ == '__main__':
    main()
