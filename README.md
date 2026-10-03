# Halloween Display

A giant two-segment spider hung over Impasse du Rossignol in Les Portes-en-Ré
(Île de Ré), for 31 October 2026. People walk underneath; the legs reach the
houses on both sides of the 3 m alley. The brief is in `docs/`.

## 3D visualizer

`visualizer/` is a web page (three.js, no build step, nothing to install)
that shows the spider in a 3D model of the real alley and lets every size be
adjusted. Run it on Linux with the system Python:

    python3 visualizer/run.py

It serves the page on localhost and opens the browser (Chrome works). The
page needs a web server because it loads JavaScript modules, which browsers
refuse from `file://`.

What it shows:

- The alley and the surrounding block, built from IGN's open BD TOPO
  building footprints with their eave heights, on the IGN orthophoto. The
  alley runs south from Rue de Trousse Chemise for 45 m; the walls are
  2.94 m apart along the stretch to be used and about 3.7 m at the mouth.
- The spider in the brief's locked proportions by default (body length
  L = 0.8 m, back-pair knee bend 60°, front pair 30°, feet on the real
  walls at staggered heights). Pick another L or bend and press
  "Apply brief ratios at L".
- Sliders for the abdomen (length, width, height), the head (same), their
  overlap and lift, the body's position along, across and above the alley,
  which way it faces, and for each leg pair the knee bend, the upper segment
  length, and where the foot lands on the wall (along the alley and height).
  Leg thickness is set per segment. The lower leg segment (knee to foot) is
  derived so the foot lands where it is put; the brief's ratios would
  over-constrain it otherwise.
- A numbers panel: heights, clearance over the walking path, every leg
  length, and each dimension against the brief's ratios (green when it
  matches).
- Views: street (eye height at the alley mouth), front, side, top, under,
  overview. Save PNG, and copy a link that holds the whole design.

Tests: open `tests.html` from the same server and read the PASS/FAIL list.
CLAUDE.md has the headless Chrome command for the same check.

Site data is cached in `visualizer/site/` (site.json, ortho.jpg). To refresh
it from IGN: `python3 visualizer/site/fetch_site.py`.

## Data sources

- IGN BD TOPO v3 buildings and roads, BD ORTHO orthophoto, RGE ALTI
  elevation, all via data.geopf.fr (Licence Ouverte / Etalab 2.0).
- three.js r170 (MIT), vendored in `visualizer/vendor/`.
