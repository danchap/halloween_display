# Halloween Display

A giant two-segment spider hung over Impasse du Rossignol in Les Portes-en-Ré
(Île de Ré), for 31 October 2026. People walk underneath; the legs reach the
houses on both sides of the 3 m alley. The brief is in `docs/`.

## Online

The viewer is live at https://danielsknowledge.com/halloween/ with the
same sliders, plus Walk (first person: W A S D, mouse to look, F to fly)
and Play the path. It is served as static files by the web server behind
danielsknowledge.com, from a clone of this repo on that server;
`visualizer/tools/deploy_site.sh` pushes and pulls it. The walk-through
video is at https://claude.ai/artifact/KqzFnsro5Svw8bLHnKhrSw. (An earlier
copy of the viewer on claude.ai was retired on 2026-10-04 and now points
here.)

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
  walls at staggered heights), with Daniel's choices: a capsule body
  2.5 m up on the alley's centreline, 6.5 m into the alley with the head
  toward the street, legs 4.8 cm and 3.6 cm thick. Pick another L and
  press "Apply brief ratios at L". Two angle sliders, the hip (the upper
  segment's angle above level where it leaves the body) and the back-pair
  knee bend (front pair half, the middle pairs between), are locked by
  default: unlocking them, or moving one, poses every leg from the two
  angles at the brief's leg length, with each foot landing where that
  puts it on the wall. "Spread the legs like a spider" fans them out in
  plan instead (55° and 22° forward, 22° and 55° back) at the same two
  angles, scaling each leg to reach its wall.
- Sliders for the abdomen (length, width, height), the head (length in
  front of the abdomen, width, height), the body's position along and
  above the alley, the pitch of the whole spider (body and legs turn
  together about the body centre, head up for a positive angle; each foot
  keeps to its wall), and the leg thickness per segment. The scenery has
  no controls: it is measured.
- Knees and feet are dragged in the view (orange balls). Every ball moves
  in the vertical plane along the alley walls: a foot slides on its wall, a
  knee moves along the alley and up and down. With Shift, Ctrl or Alt held
  a knee moves across the alley instead. Each of the eight legs moves on
  its own; two buttons copy one side onto the other. Both segment lengths
  and the bend follow from where the three points are.
- Designs: "Save as…" keeps the current parameters under a name in the
  browser; the Design list loads one back, or the brief defaults.
- Display: the knee and foot markers, and the plants cut from the photo.
  Roofs, the lane from the photo and the blue sky are always on.
- A Controls pop-up (the Controls button, the C key, or a double-tap on
  the view) lists the orbit, leg and walk controls.
- A numbers panel (hidden by default, "Numbers" at the top right): heights,
  clearance over the walking path, every leg length, and each dimension
  against the brief's ratios (green when it matches). The parameters panel
  collapses too.
- The sun stands where it does at noon (12:00 CET) on 31 October 2026
  over the alley: azimuth 166°, 28.5° up, computed in `sun.js` from the
  date and the site's coordinates, so shadows are the real ones.
- A numbers panel (hidden by default, "Numbers" at the top right): heights,
  clearance over the walking path, every leg length, and each dimension
  against the brief's ratios (green when it matches). The parameters panel
  collapses too.
- Views: street (eye height at the alley mouth), front, side, top, under,
  overview. Save PNG, and copy a link that holds the whole design.
- Walk: first-person with W A S D or arrows, drag or click the view to
  look (the mouse is captured; Esc frees it), Shift to hurry, F to fly
  (Space up, X down); on a phone the left half of the view moves and the
  right half looks.
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
`site/sprites/`).

## Data sources

- IGN BD TOPO v3 buildings and roads, BD ORTHO orthophoto, RGE ALTI
  elevation, all via data.geopf.fr (Licence Ouverte / Etalab 2.0).
- three.js r170 (MIT) and mp4-muxer 5 (MIT), vendored in `visualizer/vendor/`.
- The photo of Rue de Trousse Chemise is Daniel's.
