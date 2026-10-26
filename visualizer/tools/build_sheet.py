#!/usr/bin/env python3
"""Write the build sheet (docs/build-sheet.md) and the data for its diagrams
from a solve report written by visualizer/out/solve-v2.html.

    python3 tools/build_sheet.py out/solve-v2-final.txt ../docs/build-sheet.md ../docs/build-sheet/build.json

The report holds one PARAMS line (the design parameters the page uses), one
JSON <system> line (the page's parts for that design: legs, cuts, skis, hub,
bill of materials), the SOLVE lines (how far each foot and knee moved from
v1), the ALUPOST and ALUSKI lines (the aluminium structure for the same
feet) and the SENSITIVITY lines (what deeper sockets would do). Everything
numeric in the sheet comes from there; the prose is here.
"""
import datetime
import json
import math
import re
import sys

NAMES = ['1R', '1L', '2R', '2L', '3R', '3L', '4R', '4L']
L_WALL_CORNER = 2.07  # x of the east house's street corner (the plaque)
WALL = 1.425          # the walls' distance from the alley's axis, Daniel's 2.85 m of 2026-10-26
# v1's angles, from the assembly manual of 2026-10-15, for the comparison table.
V1 = {
    'hip': [58.4, 57.6, 38.7, 31.8, 25.1, 32.5, 51.7, 53.4],
    'knee': [47.2, 66.1, 49.9, 69.6, 82.4, 57.5, 68.1, 37.1],
    'foot': [93.0, 97.9, 85.1, 66.3, 44.9, 48.9, 30.5, 50.9],
    'hipSet': ['45 + 20 at 54.5°', '45 + 20 at 57.9°', '45 + 20 at 118.7°', '30', '45 + 20 at 175.5°', '30', '45 + 20 at 79.4°', '45 + 20 at 73.6°'],
    'kneeSet': ['45', '67.5', '45 + 20 at 85.2°', '67.5', '45 + 45 at 42.7°', '45 + 20 at 58.3°', '67.5', '45 + 20 at 123.4°'],
    'footSet': ['45 + 67.5 at 60.4°', '45 + 67.5 at 51.3°', '87.5', '67.5', '45', '45 + 20 at 88.3°', '30', '45 + 20 at 82.0°'],
}
ENDS = {20: 'M/F', 30: 'M/F', 45: 'M/F', 67.5: 'F/F', 87.5: 'F/F'}


def m3(v):
    return f'{v:.3f}'


def d1(v):
    return f'{v:.1f}'


def ang(a):
    return str(int(a)) if float(a).is_integer() else str(a)


def set_text(recipe):
    angles = recipe['angles']
    if len(angles) == 1:
        return ang(angles[0])
    return f"{ang(angles[0])} + {ang(angles[1])} at {d1(recipe['twist'])}°"


def follows(recipe, what):
    last = recipe['angles'][-1]
    return f'a coupler, {what} into the coupler' if ENDS[last] == 'M/F' else f"nothing: {what} into the {ang(last)}'s second socket"


def foot_follows(recipe):
    last = recipe['angles'][-1]
    return "its spigot straight into the reducer's Ø 40 socket" if ENDS[last] == 'M/F' else f"a 42 mm link of Ø 40 PVC pipe from the {ang(last)}'s second socket into the reducer"


def parse(path):
    out = {'solve': {}, 'alupost': {}, 'aluski': {}, 'sens': {}}
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('PARAMS '):
            out['params'] = json.loads(line[7:])
        elif line.startswith('JSON '):
            _, system, rest = line.split(' ', 2)
            out['system'] = system
            out['data'] = json.loads(rest)
        elif line.startswith('SOLVE '):
            m = re.match(r'SOLVE (\w+) cost (\S+) hip (\S+) turn (\S+) knee (\S+) roll (\S+) foot (\S+) \| foot moved along (\S+) up (\S+) \(foot now x (\S+) y (\S+)\) \| knee moved (\S+)', line)
            out['solve'][m.group(1)] = {'cost': float(m.group(2)), 'along': float(m.group(8)), 'up': float(m.group(9)), 'knee': float(m.group(12))}
        elif line.startswith('ALUPOST '):
            m = re.match(r'ALUPOST (\w+) x (\S+) footHeight (\S+) postHeight (\S+) post (\S+)', line)
            out['alupost'][m.group(1)] = {'x': float(m.group(2)), 'footHeight': float(m.group(3)), 'postHeight': float(m.group(4)), 'post': float(m.group(5))}
        elif line.startswith('ALUSKI '):
            m = re.match(r'ALUSKI (\w) from (\S+) to (\S+) pieces (.*) tees at (.*)', line)
            out['aluski'][m.group(1)] = {'from': float(m.group(2)), 'to': float(m.group(3)), 'pieces': [float(v) for v in m.group(4).split(', ')], 'tees': [float(v) for v in m.group(5).split(', ')]}
        elif line.startswith('SENSITIVITY '):
            m = re.match(r'SENSITIVITY (\w+) .*: foot moves along (\S+) up (\S+) across (\S+)', line)
            out['sens'][m.group(1)] = {'along': float(m.group(2)), 'up': float(m.group(3)), 'across': float(m.group(4))}
    return out


def bar_plan(pieces, bar=4.0, kerf=0.003):
    """First-fit decreasing of labelled pieces into bars. Returns a list of bars, each a list of (label, length)."""
    bars = []
    for label, length in sorted(pieces, key=lambda p: -p[1]):
        for b in bars:
            used = sum(l for _, l in b) + kerf * len(b)
            if used + length + kerf <= bar + 1e-9:
                b.append((label, length))
                break
        else:
            bars.append([(label, length)])
    return bars


def main():
    report, md_out, json_out = sys.argv[1:4]
    r = parse(report)
    p, data = r['params'], r['data']
    legs = sorted(data['legs'], key=lambda a: a['leg'])
    feet = data['feet']
    cuts = data['cuts']
    skis = {s['side']: s for s in data['skis']}
    lines = data['lines']
    date = datetime.date.today().isoformat()
    ski_z = {side: skis[side]['z'] for side in 'RL'}
    between = abs(ski_z['R']) + abs(ski_z['L'])

    def cut(role, j):
        return next(c for c in cuts if c['role'] == role and c.get('leg') == j)

    def leg_at_x(side, x):
        return min((j for j in range(8) if NAMES[j][1] == side), key=lambda j: abs(feet[j]['foot'][0] - x))

    def bom(prefix):
        return next((l for l in lines if l['item'].startswith(prefix)), None)

    md = []
    w = md.append

    w('# Alley Spider Build Sheet')
    w('')
    w(f'The dimensions and angles of the eight legs as they will be built from the tubes already cut, and the support structure for them, for the alley as measured on 2026-10-26: 2.85 m between the walls. Written {date} from the visualizer\'s "default" design in its as-built part system (aluminium Ø 40 legs in Ø 40 PVC fittings, a PVC hub, PVC Ø 50 posts and skis). It supersedes the leg angles, the positions and the structure numbers of the assembly manual of 2026-10-15; the manual\'s methods (marking, cementing, packing, the lift) still apply and are referred to below.')
    w('')
    w('## What this sheet assumes')
    w('')
    w('- The sixteen leg tubes are cut to the manual\'s lengths (the table in The legs). A tube more than 3 mm off its length changes the angles at its two ends by a fraction of a degree, which the fixes on the island absorb; a tube off by a centimetre or more: tell me the length and I will solve again.')
    w('- The hub is built: four crosses touching end to end, 0.116 m centre to centre, with 0.078 m stubs, except the two L stubs of X2 and X3, which are longer because their hip set is a single 30° elbow. The hip elbows are not yet on.')
    w(f'- Every socket in the Ø 40 PVC fittings takes the tube 21 mm deep (your measurement), in a fitting of the catalogue\'s outside size. So every pipe stops 6 mm short of where the catalogue\'s 27 mm socket would put it, and every length below is computed that way. Check it once more before anything is cemented (Check first).')
    w(f'- The walls are 2.85 m apart where the posts stand, and the body hangs on the alley\'s centreline, 1.425 m from each wall; its centre is 6.5 m along the alley from the junction of the road centrelines, {m3(p["bodyHeight"])} m up, pitched {p["pitch"]}° head toward the street.')
    w('- The elbow sets are the ones bought for v1, with one change: the knee of leg 2L becomes a pair of 45° elbows with a coupler (from the spares) instead of the single 67.5°, because with three single elbows that leg could only land its foot on top of 1L\'s post. Every other single elbow is kept and now makes its joint\'s angle exactly; every pair is set to the twist in the tables.')
    w('- Names are the manual\'s: legs 1R to 4L, front pair first, R the right-hand wall looking in from the street (the garage side), L the east house with the plaque. 1R-U is the upper tube of 1R, 1R-L the lower, 1R-P the post; 1R-H, 1R-K, 1R-F its hip, knee and foot sets; X1 to X4 the hub\'s crosses from the head.')
    w('- x is metres along the alley from the junction of the road centrelines, as on the page; the plaque corner of the east house is at x = 2.07, so a distance from that corner is x less 2.07.')
    w('')
    w('![The three joints of a leg and the sign of each angle](build-sheet/joints.svg)')
    w('')
    w('How the angles are defined: the hip angle is between the stub (straight across the alley) and the upper tube, and the hip turn is the upper\'s plane turned about the stub, 0 toward the head, positive up. The knee bend is how far the lower turns off the upper\'s line, and the knee roll is the knee\'s plane turned about the upper from the hip\'s plane, positive clockwise seen from the hip looking toward the knee. The foot bend is between the lower and the post, and the foot roll is the foot\'s plane about the lower from the knee\'s plane, in the same sense. A pair of elbows at its twist makes its joint\'s angle; a single elbow makes its own.')
    w('')

    w('## Check first')
    w('')
    w('Do these before any elbow is cemented and before any Ø 50 pipe is cut.')
    w('')
    w('1. The socket depth, once more, on an elbow and on a coupler: push a leg tube in by hand as far as it goes and mark the tube at the fitting\'s mouth. 21 mm is what every number here assumes. Then push a pencil in from the other side of a coupler until it touches the tube\'s end and compare: if the pencil says the tube is still short of the bottom, push harder, with a twist. If the tube really goes 27 mm in, stop and tell me: every joint then sits 6 mm nearer the next one and the feet land up to 4 cm away from where this sheet puts the posts, and I will solve again before you cut a post.')
    w('2. Measure a coupler end to end: about 60 mm. A coupler of about 48 mm with a 21 mm socket means the fittings are smaller than the catalogue, not shallower, and the tables hold without change; say which you have either way.')
    w('3. Count the elbows against the table in The fitting sets: the counts needed now and what the manual\'s baskets held.')
    w('4. Measure the sixteen tubes against the table in The legs and label them, if not done yet.')
    w('')

    # ---- legs
    w('## The legs')
    w('')
    w('The tubes, as cut (the manual\'s lengths; the page now computes the same lengths from the measured sockets):')
    w('')
    w('| Leg | Upper tube | Lower tube |')
    w('|---|---|---|')
    for j, a in enumerate(legs):
        w(f'| {NAMES[j]} | {m3(a["upper"])} | {m3(a["lower"])} |')
    w('')
    w('### The fitting sets')
    w('')
    w('Each set is listed from the tube before it. A pair goes together spigot into socket, the male-female elbow first; its twist is the angle between the two elbows\' planes, read with the protractor on a dry fit before cementing, as in the manual (Telling the elbows apart). What follows a set depends on its last elbow: a coupler after a male-female elbow, nothing after a female-female one, whose second socket takes the next tube or the post.')
    w('')
    w('| Leg | Hip set, from the stub | Then | Knee set, from the upper | Then | Foot set, from the lower | Then, down to the post |')
    w('|---|---|---|---|---|---|---|')
    for j, a in enumerate(legs):
        w(f'| {NAMES[j]} | {set_text(a["hip"]["recipe"])} | {follows(a["hip"]["recipe"], "the upper")} | {set_text(a["knee"]["recipe"])} | {follows(a["knee"]["recipe"], "the lower")} | {set_text(a["foot"]["recipe"])} | {foot_follows(a["foot"]["recipe"])} |')
    w('')
    w('Under every foot set comes the post\'s stack: the 50/40 reducer (its Ø 40 socket up, taking the foot set\'s spigot or the link), its Ø 50 spigot in a Ø 50 coupler, the Ø 50 post in the coupler. The four links are cut from the Fitt Ø 40 pipe left from the hub, 42 mm each, and go 21 mm into each socket. With the aluminium structure instead (below), the post goes straight into the foot set or into a coupler on it, as the manual says.')
    w('')
    counts = {}
    for a in legs:
        for k in ('hip', 'knee', 'foot'):
            for e in a[k]['recipe']['angles']:
                counts[e] = counts.get(e, 0) + 1
    couplers = sum(1 for f in data['fittings'] if f['name'] == 'coupler Ø 40')
    bought = {45: 20, 20: 12, 30: 3, 67.5: 10, 87.5: 5}
    w('Elbows needed now, against the manual\'s baskets:')
    w('')
    w('| Elbow | Needed | In the baskets | Spare |')
    w('|---|---|---|---|')
    for e in (45, 20, 30, 67.5, 87.5):
        w(f'| {ang(e)}° {ENDS[e]} | {counts.get(e, 0)} | {bought[e]} | {bought[e] - counts.get(e, 0)} |')
    w(f'| Coupler Ø 40 | {couplers} | 20 | {20 - couplers} |')
    w('')
    w('### The angles')
    w('')
    w('The hip turn is set when the hip set goes on its stub (the manual: Setting the hips on the hub); the knee roll and the foot roll are marked on the tubes as lines K and F (the manual: Marking a tube) before the sets go on. The lower\'s plan angle is how far its direction, seen from above, turns from straight across the alley toward the street (positive) or the dead end (negative); it is a check, not a setting.')
    w('')
    w('| Leg | Hip angle | Hip turn | Knee bend | Knee roll | Foot bend | Foot roll | Lower\'s plan |')
    w('|---|---|---|---|---|---|---|---|')
    for j, a in enumerate(legs):
        w(f'| {NAMES[j]} | {d1(a["hip"]["angle"])} | {d1(a["hip"]["roll"])} | {d1(a["knee"]["bend"])} | {d1(a["knee"]["roll"])} | {d1(a["foot"]["bend"])} | {d1(a["foot"]["roll"])} | {d1(a["foot"]["plan"])} |')
    w('')
    w('Lines K and F on the tubes. Line 0 on an upper is the side the hip set\'s open socket points to; on a lower, the side that faces the upper at the knee. Looking at the tube\'s far end face (the knee end of an upper, the foot end of a lower), a positive roll goes anticlockwise round the protractor from line 0, a negative one clockwise; the last column is the same angle as a distance round the tube\'s 40 mm outside, for a paper strip.')
    w('')
    w('| Leg | Line K on the upper | Direction | mm round the tube | Line F on the lower | Direction | mm round the tube |')
    w('|---|---|---|---|---|---|---|')
    for j, a in enumerate(legs):
        kr, fr = a['knee']['roll'], a['foot']['roll']
        mm = lambda v: str(int(round(abs(v) * math.pi * 40 / 360)))
        dr = lambda v: 'anticlockwise' if v > 0 else 'clockwise'
        w(f'| {NAMES[j]} | {d1(abs(kr))}° | {dr(kr)} | {mm(kr)} | {d1(abs(fr))}° | {dr(fr)} | {mm(fr)} |')
    w('')
    w('### Where the knees and the feet end up')
    w('')
    w('For the checks during the lift (the manual: Seating a leg). Heights are above the lane; "in from the ski" is horizontal, from the ski\'s centreline to the knee\'s centre; "from the tee" is along the wall, positive toward the dead end, negative toward the street.')
    w('')
    w('| Leg | Knee height | Knee in from the ski | Knee from the tee | Knee x | Foot height | Foot x |')
    w('|---|---|---|---|---|---|---|')
    for j, a in enumerate(legs):
        f = feet[j]
        side = NAMES[j][1]
        w(f'| {NAMES[j]} | {m3(f["knee"][1])} | {m3(abs(f["knee"][2] - ski_z[side]))} | {m3(f["knee"][0] - f["foot"][0])} | {m3(f["knee"][0])} | {m3(f["foot"][1])} | {m3(f["foot"][0])} |')
    w('')
    hub = data['hub']
    ax = hub['axis']
    w(f'The hub: the spine\'s axis runs from {m3(ax["a"][1])} m up at x = {m3(ax["a"][0])} (the tail cap) to {m3(ax["b"][1])} m up at x = {m3(ax["b"][0])} (the head cap), along the body\'s 45° slope; the crosses sit at x = ' + ', '.join(m3(data['roots'][2 * i][0]) for i in range(4)) + f' (X1 to X4), their side branches level, the hip joints 0.130 m out from the axis on each side.')
    w('')
    w('### What changed from the manual')
    w('')
    w('The feet move a few centimetres along their walls because the walls are closer than the map said and because every single elbow now makes its exact angle. Positive "along" is toward the dead end.')
    w('')
    w('| Leg | Foot moved along | Foot moved up | Hip angle, manual to now | Knee bend | Foot bend | Sets |')
    w('|---|---|---|---|---|---|---|')
    for j, a in enumerate(legs):
        s = r['solve'][NAMES[j]]
        sets = []
        for k, key in (('hip', 'hipSet'), ('knee', 'kneeSet'), ('foot', 'footSet')):
            now = set_text(a[k]['recipe'])
            if now.split(' at ')[0] != V1[key][j].split(' at ')[0]:
                sets.append(f'{k}: {V1[key][j].split(" at ")[0]} to {now.split(" at ")[0]}')
        w(f'| {NAMES[j]} | {m3(s["along"])} | {m3(s["up"])} | {d1(V1["hip"][j])} to {d1(a["hip"]["angle"])} | {d1(V1["knee"][j])} to {d1(a["knee"]["bend"])} | {d1(V1["foot"][j])} to {d1(a["foot"]["bend"])} | {"; ".join(sets) if sets else "the same"} |')
    w('')

    # ---- structure
    w('## The support structure')
    w('')
    w('Two skis of Ø 50 PVC pipe lying along the feet of the walls, four Ø 50 tees in each, a plumb Ø 50 post in each tee, and on top of each post a Ø 50 coupler, a 50/40 reducer and the leg\'s foot set. The pipe comes in 4 m bars and is cut on the island with the blue ratchet cutter (it takes 63 mm); the fittings are the pvc40 ones of the plan. Nothing is fixed to the walls; the skis are set 2.78 m apart from each other, centre to centre, not from the walls.')
    w('')
    w('![The two skis, their tees and the body, from above](build-sheet/plan.svg)')
    w('')
    w('### Parts to buy')
    w('')
    pipe50 = bom('pipe Ø 50')
    w('| Item | Qty | Where |')
    w('|---|---|---|')
    w(f'| PVC pipe Ø 50 × 4 m (3 mm wall, evacuation, white or grey) | {pipe50["qty"] if pipe50 else 7} bars | plomberie.fr delivered to the neighbours, or a Castorama or Leroy Merlin delivery; the plan\'s section D |')
    w('| Tee Ø 50 F/F/F, 87.5° | 8 | Amazon, the plan\'s section B, or the same shop as the pipe |')
    w('| Reducer 50/40 (Ø 40 socket, Ø 50 spigot) | 8 | the same |')
    w('| Coupler Ø 50 | 8 | the same |')
    w('| Cap Ø 50 | 4 | the same |')
    w('| Self-drilling screws 4.2 × 16 | about 100: 48 for the skis and the posts in their tees, 48 for the stacks and the feet | from the Paris packs, or a box on the island |')
    w('| Ø 40 PVC pipe for the four links | 0.17 m | the Fitt pipe left from the hub |')
    w('')
    w('The structure weighs about 24 kg of pipe and 2 kg of fittings. Also from the manual\'s island list: the prop (a 2.4 m batten with a cradle), two ladders, the drill with a 3 mm bit and a Torx bit, a level, a 10 m tape, chalk, shims, a few 40 mm discs for the tees.')
    w('')
    w('### Cut list')
    w('')
    w('Posts, from the floor of the tee\'s branch socket to the floor of the Ø 50 coupler\'s socket:')
    w('')
    w('| Post | Length | Foot joint above the lane | Post top above the ski top |')
    w('|---|---|---|---|')
    for j, a in enumerate(legs):
        w(f'| {NAMES[j]}-P | {m3(a["post"])} | {m3(feet[j]["foot"][1])} | {m3(a["post"] + 0.001)} |')
    w('')
    links = [c for c in cuts if c['role'] == 'link']
    if links:
        w(f'Links of Ø 40 PVC pipe between a female-female foot elbow and its reducer: {len(links)} pieces of {m3(links[0]["length"])} m, for legs ' + ', '.join(NAMES[c['leg']] for c in links) + ', from the Fitt pipe left over from the hub.')
        w('')
    w('Ski pieces, from the street end, with the tee that follows each piece:')
    w('')
    w('| Right ski (R wall) | Length | Left ski (L wall) | Length |')
    w('|---|---|---|---|')
    pieces = {}
    for side in 'RL':
        pcs = [c for c in cuts if c['role'] == 'ski' and c.get('side') == side]
        posts = sorted(skis[side]['posts'])
        labels = []
        for i, c in enumerate(pcs):
            after = f', then tee {NAMES[leg_at_x(side, posts[i])]}' if i < len(posts) else ', then the cap'
            labels.append((f'{side}{i + 1}{after}', c['pieces'][0]))
        pieces[side] = labels
    for i in range(5):
        rl, rv = pieces['R'][i]
        ll, lv = pieces['L'][i]
        w(f'| {rl} | {m3(rv)} | {ll} | {m3(lv)} |')
    w('')
    w('The pieces assume a Ø 50 tee whose socket is 27 mm deep with its centre 38.75 mm beyond the socket\'s floor, and a cap with a 6 mm floor; these fittings were not measured. Before cutting the skis, cut one test piece of 0.300 m, push it home into two tees and measure between the tees\' centres: the sheet expects 0.378 m. If you read something else, add half the difference to each end of every ski piece that meets a tee (a piece between two tees gets the whole difference).')
    w('')
    all_pieces = [(f'{NAMES[j]}-P', a['post']) for j, a in enumerate(legs)] + [(l.split(',')[0], v) for side in 'RL' for l, v in pieces[side]]
    plan = bar_plan(all_pieces)
    w(f'Cutting plan for the 4 m bars ({len(plan)} bars, 3 mm lost at each cut; the shortest bar is for the offcuts and the test piece):')
    w('')
    w('| Bar | Pieces | Used |')
    w('|---|---|---|')
    for i, b in enumerate(plan):
        w(f'| {i + 1} | ' + ', '.join(f'{l} {m3(v)}' for l, v in b) + f' | {m3(sum(v for _, v in b) + 0.003 * len(b))} |')
    w('')
    w('### Positions')
    w('')
    w('Where each tee goes, three ways: x along the alley, the distance from the east house\'s plaque corner (x less 2.07, measured along the wall; for the R wall measure from a line square across the alley from that corner), and the distance from the ski\'s own street end, for a tape hooked on the ski.')
    w('')
    w('| Post | Wall | Tee centre at x | From the plaque corner | From the ski\'s street end |')
    w('|---|---|---|---|---|')
    tee_rows = []
    for side in 'RL':
        for x in sorted(skis[side]['posts']):
            j = leg_at_x(side, x)
            tee_rows.append((NAMES[j], side, x, x - L_WALL_CORNER, x - skis[side]['from']))
    for name, side, x, c, s in sorted(tee_rows, key=lambda t: (t[0][0], 0 if t[0][1] == 'R' else 1)):
        w(f'| {name} | {side} | {m3(x)} | {m3(c)} | {m3(s)} |')
    w('')
    w('The skis:')
    w('')
    w('| Ski | Street end at x | Back end at x | Length | From the plaque corner to the street end | Tee spacings along the ski |')
    w('|---|---|---|---|---|---|')
    for side in 'RL':
        s = skis[side]
        ps = sorted(s['posts'])
        sp = ', '.join(m3(b - a) for a, b in zip(ps, ps[1:]))
        w(f'| {side} | {m3(s["from"])} | {m3(s["to"])} | {m3(s["length"])} | {m3(s["from"] - L_WALL_CORNER)} | {sp} |')
    w('')
    w(f'Between the skis, centre to centre, with a tape held across the alley ({m3(between)} m straight across; the walls are 2.85 m apart, each ski\'s centre is {m3(WALL - abs(ski_z["R"]))} m from its wall):')
    w('')
    w('| From | To | Along the alley | Tape reading |')
    w('|---|---|---|---|')
    w(f'| R ski street end | L ski street end | {m3(skis["L"]["from"] - skis["R"]["from"])} | {m3(math.hypot(skis["L"]["from"] - skis["R"]["from"], between))} |')
    for i in range(4):
        xr, xl = feet[2 * i]['foot'][0], feet[2 * i + 1]['foot'][0]
        w(f'| tee {NAMES[2 * i]} | tee {NAMES[2 * i + 1]} | {m3(xl - xr)} | {m3(math.hypot(xl - xr, between))} |')
    w('')
    w('![The R wall seen from the alley](build-sheet/elevation-R.svg)')
    w('')
    w('![The L wall seen from the alley](build-sheet/elevation-L.svg)')
    w('')
    w('### How to build it')
    w('')
    w('The order is the manual\'s (Island: the support structure), with the Ø 50 pipe cut on the spot. Children out of the alley from the first post up. Two adults for every post over 2.5 m.')
    w('')
    w('1. Measure the alley between the walls at x = 4.4, 5.7, 6.3 and 7.5 (the R tee positions), above the plinth. The sheet assumes 2.85 m. If any reading is under 2.83 m, tell me before cutting: the skis cannot both lie at 2.78 m apart there.')
    w('2. Unpack the bars and the fittings. Push a Ø 50 pipe end into a tee, a coupler and a cap: it should go in by hand with some force. Push a leg tube or a Ø 40 offcut into a reducer\'s Ø 40 socket the same way.')
    w('3. Cut the 0.300 m test piece and measure it in two tees (Cut list). Then cut every piece of the cutting plan with the ratchet cutter, square, turning the cutter and not the pipe, and label each piece as it comes off (the manual: Marking every piece). File the burr off every end.')
    w('4. Lay the R ski first: its pieces in order from the street end with a tee between each pair and a cap at each end, every piece pushed home. Check the tee spacings with the tape hooked on the ski\'s street end (Positions). Place it along the R wall with its street end at the distance from the plaque corner in the skis table, measured square across from that corner.')
    w('5. Lay the L ski the same way and place it from the R ski, not from its wall: its street end is further into the alley than the R ski\'s by the figure in the between-the-skis table, and the tape from the centre of one ski\'s street end to the centre of the other\'s reads the tape reading there. Check the four tee-to-tee diagonals. Then measure the gap between each ski and its wall at both ends and in the middle, and pack every gap at two or three points with foam offcuts or strips of wood so that nothing can push a ski toward its wall.')
    w('6. Screw the skis: stand the shortest post (4R-P) in a tee as a gauge, hold a level against it across the alley and roll the tee on its pipes until the post is plumb, then two screws through each run socket of the tee (one on top, one on the alley side, 12 mm in from the mouth, 3 mm pilot). Lift the gauge out and go to the next tee. Eight tees, 32 screws. Push the caps home and screw them.')
    w('7. Build the stack for each post on the ground: the Ø 50 coupler on the post\'s top end (two screws), the reducer\'s spigot in the coupler (two screws). The foot set goes on when the leg is seated, not now.')
    w('8. Stand the posts in the order 4R, 4L, 3R, 3L, 2R, 2L, 1R, 1L, each lowered into its tee until it stops on the socket\'s floor, checked plumb along and across with the level, then two screws through the tee\'s branch into the post. Measure from the ski top to the top of the post pipe: the figure in the posts table within 5 mm. Push the post top along the wall and toward the alley: no movement at the tee. Tape over the open reducer against rain.')
    w('9. On the day the spider goes up, the posts are stood pair by pair just before their legs go on (the manual: Island: putting the spider on its legs), the back pair first; the knee positions to check against are in Where the knees and the feet end up.')
    w('')
    w('Fixes on the day, from the manual: a foot set that lands a centimetre above its reducer gets a 40 mm disc dropped into the tee under the post; one that lands up to 3 cm low has its post shortened; a foot set turned a few degrees off its post has the lower turned a little in its knee set before the knee is fixed.')
    w('')
    w('### The aluminium structure instead')
    w('')
    w('If the posts and skis are ordered from Comment Fer cut to length (aluminium Ø 40 × 1.5 in Ø 40 PVC tees, the manual\'s way), the tees sit at the same x; a post then goes straight into the foot set and the pieces are:')
    w('')
    w('| Post | Aluminium post length |')
    w('|---|---|')
    for j in range(8):
        a = r['alupost'][NAMES[j]]
        w(f'| {NAMES[j]}-P | {m3(a["post"])} |')
    w('')
    for side in 'RL':
        a = r['aluski'][side]
        w(f'- {side} ski from x = {m3(a["from"])} to {m3(a["to"])}: pieces ' + ', '.join(m3(v) for v in a['pieces']) + ' (insert, piece, tee, piece, tee, piece, tee, piece, tee, piece, insert), the tee centres at x = ' + ', '.join(m3(v) for v in a['tees']) + '.')
    w('')
    w('The Ø 40 tees (Fitt) are taken with the measured 21 mm sockets; the skis then sit 1.397 m from the axis, 5 mm further out than the Ø 50 ones, which changes nothing else.')
    w('')

    # ---- if the sockets differ
    w('## If the sockets turn out deeper')
    w('')
    mx = max(abs(v) for s in r['sens'].values() for v in s.values())
    w(f'With the same elbows at the same angles, tubes that go 27 mm into every socket instead of 21 make every leg shorter, and the feet land elsewhere: up to {int(round(mx * 100))} cm nearer the alley\'s centre, {int(round(max(abs(s["along"]) for s in r["sens"].values()) * 100))} cm along the wall and {int(round(max(abs(s["up"]) for s in r["sens"].values()) * 100))} cm in height, differently for each leg. That is more than the island fixes take up, so the socket check comes first; the hub\'s stubs were cut for 21 mm sockets as well.')
    w('')
    w('| Leg | Foot moves along | Foot moves up | Foot moves toward the alley\'s centre |')
    w('|---|---|---|---|')
    for j in range(8):
        s = r['sens'][NAMES[j]]
        side = 1 if NAMES[j][1] == 'R' else -1
        w(f'| {NAMES[j]} | {m3(s["along"])} | {m3(s["up"])} | {m3(-side * s["across"])} |')
    w('')

    # ---- appendix
    w('## Appendix: the design on the page')
    w('')
    w('The page at danielsknowledge.com/halloween shows this spider as its "default" design in the part system "As built"; its Numbers panel lists the same cut list and angles. The design\'s leg parameters, for the record (metres; along and height in the level pose, the knee\'s out from the body\'s axis):')
    w('')
    w('| Leg | footAlong | footHeight | kneeAlong | kneeHeight | kneeOut |')
    w('|---|---|---|---|---|---|')
    for j, q in enumerate(p['legs']):
        w(f'| {NAMES[j]} | {q["footAlong"]} | {q["footHeight"]} | {q["kneeAlong"]} | {q["kneeHeight"]} | {q["kneeOut"]} |')
    w('')
    warn = [x for x in data['warnings'] if 'hub crosses' not in x]
    if warn:
        w('The page\'s own warnings for this design: ' + '; '.join(warn) + '.')
        w('')
    open(md_out, 'w', encoding='utf-8').write('\n'.join(md) + '\n')

    diag = {
        'walls': {'R': WALL, 'L': -WALL},
        'lWallCorner': L_WALL_CORNER,
        'body': {'along': p['along'], 'length': p['abdomenLength'] + p['headLength'], 'width': p['abdomenWidth']},
        'skis': [],
    }
    for side in 'RL':
        s = skis[side]
        tees = []
        for x in sorted(s['posts']):
            j = leg_at_x(side, x)
            tees.append({'leg': NAMES[j], 'x': x, 'post': legs[j]['post'], 'postHeight': legs[j]['postHeight'], 'footHeight': feet[j]['foot'][1]})
        diag['skis'].append({'side': side, 'z': s['z'], 'from': s['from'], 'to': s['to'], 'tees': tees})
    json.dump(diag, open(json_out, 'w', encoding='utf-8'), indent=1)
    print(f'wrote {md_out} and {json_out}; {len(plan)} bars; between the skis {m3(between)}')


if __name__ == '__main__':
    main()
