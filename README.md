# Halloween Display

A giant two-segment spider hung over Impasse du Rossignol in Les Portes-en-Ré
(Île de Ré), for 31 October 2026. People walk underneath; the legs reach the
houses on both sides of the 3 m alley. The brief is in `docs/`.

## Online

The viewer is also published as a private claude.ai page (share it from
its Share menu): https://claude.ai/artifact/H3RJ4ZWXPziqnzm9ApMPR4. It has
the same sliders, plus Walk (first person: W A S D, mouse to look, F to
fly) and Play the path. The walk-through video is at
https://claude.ai/artifact/KqzFnsro5Svw8bLHnKhrSw.

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
  building footprints with their eave heights. The alley runs south from
  Rue de Trousse Chemise for 45 m; the walls are 2.94 m apart along the
  stretch to be used and about 3.7 m at the mouth.
- Materials and layout from Daniel's photo of Rue de Trousse Chemise
  (`visualizer/site/photos/`) and from his Street View screenshots of the
  junction and the alley, used as reference only: limewashed walls with
  the dark plinth, window and door openings cut into the walls with
  reveals and shutters hung open beside them (grey-blue mostly, some pale
  blue, some sage), canal-tile roofs with eaves and chimneys, downpipes,
  the gravel lane with its strip of pale setts, sett borders in the alley,
  the square at Rue du Gros Jonc paved edge to edge, the garage with its
  sage double door west of the alley mouth, the east house's shuttered
  alley wall with the plaque, the sign and the vine on its corner, the
  corner shop's green front, and plants cut out of the photo. Everything
  the screenshots do not show follows the same rules as a guess. The IGN
  orthophoto remains available as the ground ("Ground" in Display).
- The spider in the brief's locked proportions by default (body length
  L = 0.8 m, back-pair knee bend 60°, front pair 30°, feet on the real
  walls at staggered heights), with Daniel's choices of position and
  thickness: body axis 2.5 m up, 6.5 m into the alley with the head toward
  the street, legs 4.8 cm and 3.6 cm thick. Pick another L or bend and
  press "Apply brief ratios at L".
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
- Walk: first-person with W A S D or arrows, drag or click the view to
  look (the mouse is captured; Esc frees it), Shift to hurry, F to fly;
  on a phone the left half of the view moves and the right half looks.
  The buildings block the way. Play the path replays the scripted walk in
  the page; any move key takes over on foot.

### The path (video walk-through)

"Walk the path (video)" on the design page, or `walk.html` directly, walks
a camera at adult eye height from the Rue du Gros Jonc / Rue de Trousse
Chemise junction (starting 3.3 m along, just past the corner) east along
the street, right into Impasse du Rossignol and down the alley, slowing
and looking up at the spider while passing under it. The lens is wide (65° tall, 97° wide at 16:9) to match what a
person takes in. Play previews it in the browser; Record MP4 encodes it in
the browser (H.264, WebCodecs) and downloads `the-path.mp4`; lens, eye
height, pace and head bob are adjustable. The design travels in the URL
hash, so the walk shows whatever is on the design page.

To record without a window, headless Chrome works on Linux:

    google-chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
      "http://127.0.0.1:8765/walk.html?record=1&upload=the-path.mp4"

The file lands in `visualizer/out/` (ignored by git), about 10 minutes
for a 30 s walk at 1280×720 in software rendering. Add `&bitrate=3200000`
for a smaller copy (about 12 MB instead of 25 MB at the default 7 Mb/s).
`check.html?t=17` shows a frame of the recording to confirm it decodes.

Tests: open `tests.html` from the same server and read the PASS/FAIL list.
CLAUDE.md has the headless Chrome command for the same check.

Site data is cached in `visualizer/site/` (site.json, ortho.jpg). To refresh
it from IGN: `python3 visualizer/site/fetch_site.py`.

Site textures: `tools/bake-plants.html` cuts the plant sprites out of the
photo (open it from the server with `?upload=1` to regenerate
`site/sprites/`); `tools/build_artifact.py` builds the hosted page.

## Data sources

- IGN BD TOPO v3 buildings and roads, BD ORTHO orthophoto, RGE ALTI
  elevation, all via data.geopf.fr (Licence Ouverte / Etalab 2.0).
- three.js r170 (MIT) and mp4-muxer 5 (MIT), vendored in `visualizer/vendor/`.
- The photo of Rue de Trousse Chemise is Daniel's.
