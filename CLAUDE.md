# CLAUDE.md

Halloween Display is a project for Daniel (GitHub user danchap), started
2026-10-03. The display is a giant two-segment spider hung over Impasse du
Rossignol, Les Portes-en-Ré (Île de Ré), so people walk under it; its legs
reach the houses on both sides of the 3 m alley. Daniel's brief is in
`docs/halloween-spider-brief.pdf` (text in the .txt next to it): it locks
the proportions in units of body length and leaves the knee bend, leg
thickness and absolute size open.

## Deadline

Halloween is 2026-10-31, four weeks after the start. Plan back from that date:
parts that have to be ordered need shipping time, and anything built needs a
test run before the night.

## Visualizer (visualizer/)

- Run: `python3 visualizer/run.py` (stdlib web server + browser). Chrome is
  installed on feta; the page is three.js (vendored) with no build step.
- `spider.js` is the geometry (pure functions, tested by `tests.html`);
  `site.js` the site model; `app.js` the UI. Site data comes from IGN open
  services via `site/fetch_site.py` and is cached in `site/`.
- `walk.js` + `walk.html` are "the path": the scripted camera walk and its
  MP4 recorder (WebCodecs + mp4-muxer, vendored). `scene.js` holds the
  world shared by both pages. Headless recording: launch Chrome with the
  walk URL as its first tab (`?record=1&upload=<name>.mp4`: the name is the whole file name, and the server saves out/<name> as given); a tab opened
  through the debugging port is throttled and never finishes. The page
  posts progress to the server's stdout via /log. feta has no ffmpeg.
- `build.js` is the construction (2026-10-13): SYSTEMS, a table of part
  systems (pipe sizes, the size of each member role, a fitting per joint
  role, prices and weights as seen that day), and buildParts, which turns
  a spider model into members, fittings, posts, skis, stays and sandbags
  with the cut list, the elbow recipes, the bill of materials and
  warnings. No swivelling elbow exists in PVC, so recipeFor makes each
  joint from fixed elbows (20, 30, 45, 67.5, 87.5), one or a pair with a
  twist (cos θ = cos a cos b − sin a sin b cos ψ); pipe lengths use
  Nicoll's 27 mm sockets and Z values; elbow ends (M/F or F/F) decide
  where a coupler or a link of pipe is needed. pvc40 (the default) has
  Ø 50 posts and skis with a 50/40 reducer and a Ø 50 coupler at each
  post top; knees and hub glued, the rest screwed; two cord stays per
  post to the ski, which runs 1.5 m past the end posts, twelve sandbags
  on the skis, a liner in each front post. scene.js draws it all,
  and the face (spider.js faceOf: googly or lit eyes on the head's front
  cap, sized from the head, turned to look down the alley when pitched);
  the Construction section's state (system, longest piece delivered,
  frame only, bracing, eyes) travels in the hash, so walk.html shows the
  same build. docs/construction.md is the plan with the shopping list.
- `sun.js` puts the sun at noon CET on 2026-10-31 over the alley (Daniel's
  choice, 2026-10-05); change HALLOWEEN_NOON there for another moment.
- `textures.js` draws the village materials on canvases from colours in
  Daniel's photo (site/photos); `site.js` lays out openings per wall, cuts
  them into the wall geometry with reveals, and dresses buildings, lane
  and plants. Three buildings at the alley mouth are laid out from Street
  View (ids in site.js: east house, garage, corner shop); the rest is the
  same logic as a guess. Street View images are reference only; none of
  their pixels are in the model. Live at https://danielsknowledge.com/halloween/: the
  knowledge site's web server serves this repo's visualizer/ from a plain
  clone through an Apache Alias (site/photos and *.py denied). Deploy with
  `visualizer/tools/deploy_site.sh`; the server address lives in the
  gitignored tools/deploy_site.env, see the knowledge project's notes.
  The earlier claude.ai copy of the viewer was retired on 2026-10-04 (its
  link now points to the live page); window.HOSTED, which hid the URL-hash
  and download buttons there, stays in app.js in case a host needs it.
- Construction (`build.js`, Construction section of the page): the real
  parts of one system (SYSTEMS table) for the pose on screen, with the
  cut list and the parts list in the Numbers panel. Plumb posts (state
  key plumbPosts, on by default): `straightWalls()` puts each side's
  feet on one straight line at the innermost real wall over the stretch
  they occupy, so every post stands vertical; app.js keeps `realWalls`
  and recomputes `walls` from it before each rebuild and each drag, and
  buildParts gets `realWalls` to report the gap between each ski and a
  wall that steps out. Bracing (state key bracing: 'frame' or 'rigid',
  the BRACING data in build.js, shared by every system): the default is
  two cord stays per post through one hole at its top, one down to the
  near end of the ski (the skis run 1.5 m past the end posts for that)
  and one to the ski at the far post's tee, twelve sandbags on the skis
  where the cords pull up, a leg-size liner in each front post, and a
  warning for a foot above 2.6 m (a child hanging on its stay would
  buckle the post); or rigid pine 45 × 45 bases with brackets, gussets
  and lapped battens and no cords. Hooks in the walls were an option
  until Daniel ruled them out on 2026-10-13; per-bay X-cords and loose
  anchor bags on the ground were rejected by the structural check the
  same day (docs/construction.md, "The bracing"). The keys are saved
  with designs, carried in the hash and honoured by walk.html, as is
  the face (state key eyes: 'googly', 'lit' or 'none').
- Put screenshots and Chrome profiles under visualizer/out/ (ignored), not
  /tmp: /tmp is a quota-limited tmpfs shared with other sessions. Pass
  `--user-data-dir=out/chrome --disk-cache-size=1` to headless Chrome or
  it renders stale scripts.
- Headless check: serve, then
  `google-chrome --headless=new --no-sandbox --use-angle=swiftshader
  --enable-unsafe-swiftshader --virtual-time-budget=15000 --dump-dom
  http://127.0.0.1:8765/tests.html` and look for ALL PASSED; the same flags
  with `--screenshot` render the page.

## Settled by Daniel (do not add controls for these)

- 2026-10-06: the head faces the street, the body sits on the alley's
  centreline with no head lift, the body is a capsule, roofs and the lane
  from the photo are always shown, the sky is blue (no silhouette mode),
  no person for scale, legs are edited one by one (no mirror option, only
  the copy-side buttons). The bend series is two locked sliders (hip and
  knee bend) that keep each leg's plan angle (the feet stay put along the
  walls, the lengths follow; Daniel, 2026-10-07) plus a spread button
  (plan fan 55/22/-22/-55 degrees). The brief's-leg rule (Legs checkbox
  "Keep the brief's leg", on by default, 2026-10-07) keeps the knee at
  48 % of each leg, the leg in one vertical plane through its root and
  no longer than 3.25 L, under sliders and drags alike; a leg that cannot
  keep its plan angle within that length slides its foot toward straight
  across, and the bend is limited to the hip angle plus 90. Controls
  live in a pop-up (C key, Controls button, double-tap), not in a
  paragraph. upgradeParams in spider.js enforces the fixed values.
- 2026-10-13: the page starts from a resting pose, not the brief's: the
  whole spider pitched up 45° (climbing up and out toward the street),
  the legs fanned out in plan (the spread) with the front pairs bent
  most (the climbing series CLIMB_BEND_FACTORS, 64 / 56 / 48 / 40° at
  the slider's 60; Daniel, 2026-10-13: front legs higher, back legs
  lower, like the body's pitch), the feet at 2.6 / 2.4 / 2.2 /
  2.0 m front to back, none within a child's reach and none so high that
  a child hanging on its stay would buckle the post (DEFAULTS =
  spreadPreset in spider.js; BRIEF_DEFAULTS is the brief's own pose).
  Every pose solver (sliders, spread, drags, feet solver) works in the
  alley frame as the spider stands, pitched, so the hip angle is above
  the alley's level and the fan is the one seen from above; results are
  stored as the level pose. The construction: feet on posts joined by a
  ski per side, posts plumb (feet on one straight line per side), and a
  bracing choice (cord stays to the skis' ends, rigid wood bases); the
  cords are not beams. No hooks or fixings in the walls; the side
  frames stand on their own, the skis running 1.5 m past the end posts
  to anchor the stays, with the sandbags on them. Nothing travels in the car: every part is
  delivered to Les Portes-en-Ré, where the neighbours receive parcels.
  The bench on the east wall can be moved. Both eye options are on the
  page (googly, lit); the pose is not final.

- 2026-10-14: the posts are always plumb (no checkbox), there is no
  bracing at all (BRACING 'none' is the default and the only thing the
  page builds: the posts and the skis; the stays and the rigid bases
  stay in build.js for the record, unreachable from the page), the Body
  slider group starts collapsed, and the default pose is the spider
  climbing a 45° slope: the feet on a plane pitched with the body
  (spider.js planeFeet: 0.4 m below the axis, the pairs spread over 3 m
  along it, body 2.6 m up, so the front feet are near 3.4 m and the back
  ones near 1.3 m), the legs splayed, and every knee lifted along the
  body's own up (placeKnee's `up`, bodyUp(frame)), so the knees stand
  square to the slope and sit halfway between hip and foot when seen
  along it. The HUD still warns about feet below 2.0 m and posts over
  3 m; Daniel chose the steepness knowing that.

- 2026-10-14 (later): the brief's-leg rule is gone. The Legs checkbox is
  now "Keep the leg's lengths" (state key keepLengths; keepSplit in old
  saves maps to it): each leg keeps its two segment lengths and its knee
  keeps its roll round the hip-to-foot line, measured from the body's own
  up (spider.js kneeRoll, kneeAtRoll, solveFootKeepLengths), so a foot
  pulled in folds the knee and one pushed out straightens it, up to the
  leg's length. A knee is dragged in its leg's own plane (the plane of
  the two segments; legPlane, the 'plane' guide) and its foot follows
  along the wall in that plane (solveKneeKeepLengths); Shift still moves
  a knee across. The sliders under the rule (poseLegsKeepLengths): the
  bend slides each foot along its wall at its height, the hip rolls each
  knee; a leg that cannot meet them is held, and the HUD says so. Off,
  knees and feet move freely and the sliders give the legs the lengths
  the angles need (legsFromAngles with no cap). The Spread button still
  sets lengths up to the brief's 3.25 L.

## Still open (ask Daniel)

- Absolute size (L), knee bend and leg thickness: the visualizer exists to
  decide these. The part system and the bracing are chosen on the page
  (Construction section) and not yet by Daniel (docs/construction.md,
  "Open questions for Daniel").
- Power, weather, how the spider is hung and how the feet fix to the walls.
- Which eyes (googly or lit). Bracing is closed: none, by Daniel's
  choice of 2026-10-14; the structural numbers in docs/construction.md
  record what the cords would have added.

## This machine (feta)

- Native Ubuntu Linux. Python 3.14 with venv is available. Not installed:
  Node, arduino-cli, PlatformIO, esptool, ffmpeg, tmux. Installing system
  packages needs sudo, which needs Daniel at a terminal on feta.
- To program a board over USB, the user chappy must be in the `dialout`
  group, and it is not yet: Daniel would run `sudo usermod -aG dialout chappy`
  at a terminal on feta, then log out and back in.
- GitHub: pushing over SSH works; there is no `gh` login, so sessions cannot
  create repos or use the GitHub API.
- The other repos in ~/git (knowledge, memorize, night_sky_tracker,
  star_tracker, vibesim) are separate projects. Do not modify them from here.

## Repo status

- Created 2026-10-03 with README.md, CLAUDE.md and .gitignore; pushed to
  git@github.com:danchap/halloween_display.git (Daniel created the GitHub repo).
- 2026-10-03: visualizer added (see above) with the site data and the brief.
