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
here.) The build plan, with the parts to order, the suppliers near the
island, the cut list and the schedule, is `docs/construction.md`, also
published as a page at https://claude.ai/artifact/CNaM4SD2g21dMZypXPYdvd.

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
- The spider starts in a resting pose (Daniel, 2026-10-13): the brief's
  locked proportions at body length L = 0.8 m, a capsule body 2.5 m up on
  the alley's centreline, 6.5 m into the alley with the head toward the
  street, the whole spider pitched up 45° so it climbs up and out toward
  the street, the legs fanned out in plan like a resting spider's (55°
  and 22° forward, 22° and 55° back) and the feet on the walls at 3.0,
  2.6, 2.3 and 2.0 m from the front pair to the back, out of a child's
  reach; legs 4.8 cm and 3.6 cm thick. "Apply brief ratios at L" sets the
  brief's own pose at a chosen L (every leg the brief's full length with
  the knee bends 30/40/50/60°, the feet keeping the heights they have).
  Two angle sliders, the hip (the upper segment's angle above the alley's
  level where it leaves the body) and the back-pair knee bend (front pair
  half, the middle pairs between), are locked by default: unlocking
  them, or moving one, poses every leg from the two angles at the plan
  angle wanted for it, so a spread survives. Every pose is worked out as
  the spider stands in the alley, pitched, and stored as the level pose
  the pitch turns back onto it. Each leg is scaled to its wall, but never
  past the brief's 3.25 L: a leg that would need more is held at that
  length and its foot slides toward straight across, one that cannot
  reach its wall even straight across is stretched to just reach, and
  the HUD says which. The wanted plan angles are remembered, so bringing
  the angles back brings the fan back. The knee bend is limited to the
  hip angle plus 90°; past that the lower segment would point back under
  the knee and the knee sit inside the wall. "Spread the legs like a
  spider" fans the legs out in plan as seen from above, each foot
  keeping its height, each leg bent by the knee slider and scaled to its
  wall under the same cap.
- The brief's-leg rule, "Keep the brief's leg" in the Legs section, on
  by default: the knee stays at 48 % of each leg, the leg stays in one
  vertical plane through its root and is never longer than the brief's
  3.25 L, so a leg is fully defined by its plan angle, hip angle, bend
  and the wall. A dragged foot then turns and scales its leg, keeping the
  bend, and unfolds it once at that length; a dragged knee moves its foot
  along the wall to suit; a ball stops where the leg could not follow.
  Ticking the box re-solves every leg. Off, each ball moves alone, the
  segments can take any lengths, and the sliders let a leg grow as long
  as its angles need.
- The HUD names what is wrong with a pose: a foot with no wall, a knee
  inside a wall, a foot below the lane.
- Construction: a section under Legs picks a part system and shows the
  real parts in the view instead of the design's smooth body and legs:
  tubes with a fitting at the hip, the knee and the foot, a spine in the
  body carrying the eight hips, a vertical post under each foot down to
  the ground, a ski (a horizontal beam along the base of each wall)
  joining the four posts of a side, so nothing stands in the alley, two
  stay cords from each post top (one out to a sandbag on the ground
  1.5 m past the ski's end, one in to the ski under the post farthest
  from it) and two sandbags over each ski so it cannot roll. The systems
  are a table in `visualizer/build.js`: PVC Ø 40 legs with a black foam
  sleeve on Ø 50 posts and skis (the recommended build), PVC Ø 50
  throughout with the legs painted black, aluminium Ø 30 tube with bolted
  hinges and pool noodles, and pine 34 × 34 battens with lap joints on
  45 × 45 posts. No swivelling elbow exists in PVC, so each PVC joint is
  made from the fixed evacuation elbows (20, 30, 45, 67.5, 87.5 degrees),
  one when it is within 2.5 degrees of the need, else two in series with
  a twist between them; the cut list names them ("45 + 20 @ 112°"), and
  the pipe lengths take Nicoll's socket depth and Z values into account.
  The 20, 30 and 45 degree elbows are sold male-female and the 67.5 and
  87.5 female-female, so the parts table names the ends ("elbow 45° M/F
  Ø 40"), a pair puts the male-female elbow first, a set that ends in a
  spigot gets a coupler where a pipe follows (the hips and knees) and
  plugs straight into the reducer at the foot, and a set that ends in a
  socket gets a short link of pipe into the reducer (and between two
  female-female elbows); the cut list lists the links.
  Ø 40 pipe is fine for the legs but a Ø 40 post bends under a child's
  pull, so the posts and skis are Ø 50 with a 50/40 reducer at the top of
  each post, whose Ø 50 spigot plugs into a Ø 50 coupler on the post;
  the knee elbows and the hub crosses are glued (their
  self-weight moments exceed a screwed socket), the hip, foot and ski
  joints are screwed so they come apart. "Longest piece to ship" (1.0 m
  Colissimo, 1.4 m Chronopost, 2.0 m UPS through a packer or store
  stock, 2.7 m UPS maximum; the default is 2.0 m since the pipe will be
  bought near the island) splits any pipe longer than it with a coupler;
  "Frame only" hides the covers and the shell and shows the body's
  hoops. The Numbers panel then lists the parts in groups (pipe by size
  and stock length, fittings by name, covering and body, fixings and
  stays, with the prices seen on 2026-10-13) and the cut list (each
  leg's upper, lower and post lengths, the elbows at each joint with the
  hip's turn and the post's plan angle, which joints are glued, the ski
  and spine pieces, the stays' lengths). The HUD adds the build's
  warnings: roots moved to fit the hub's crosses (and how far the upper
  segments then differ from the design's), pieces split to ship (per
  pipe size when the sizes split at different lengths), an anchor
  sandbag far off its ski's line or with no wall at all,
  posts that lean across to meet the ski where the wall steps, a joint
  no elbow pair reaches, feet within reach of children (below 2.0 m), a
  post over 3.0 m, a stay too steep to hold. The foot fitting, the post
  and the ski sit one fitting radius inside the wall line the design
  puts the foot on, so the fittings touch the wall and nothing is in it;
  the hub is kept inside the body. The orange balls still drive the
  pose; the parts follow. The choice travels with the design, so the
  walk video shows the same construction.
  Plumb posts: the walls step by 2 to 7 cm along the alley, so feet
  placed on the real wall put the posts of a side at different distances
  from the ski's line and some lean across to meet it. "Posts plumb"
  (on by default) places each side's feet on one straight line, the
  innermost wall over the stretch the feet occupy, so every post stands
  vertical; the HUD then gives, per side, how far the ski's face stands
  off the wall where it steps out ("pack the gap with offcuts"; 0.17 m
  at the right ski's front end in the default pose, where the wall turns
  away at the alley mouth, so that overhang is trimmed or packed with a
  block). Off, the feet
  sit on the real wall and the HUD warns about the lean, as before.
  Bracing: "Bracing" chooses how the posts are held along the walls.
  Cord stays to sandbags is the default (two cords per post, anchor
  sandbags past the ski ends). Rigid wood bases replace the posts and
  skis with treated pine 45 × 45 battens: each post stands on the ski on
  a pair of angle brackets with a plywood gusset, the foot elbows sit on
  a 0.30 m stub of leg pipe clipped to the post top, battens longer than
  the stock are lapped 0.40 m, and there are no cords. Wall ties keep
  the system's posts and skis and put one hook in the wall per post pair (two posts within 1.5 m of each other)
  with a short cord from each post top, no cords to the ground; this
  needs the wall owners' consent and the HUD says so. The parts table,
  cut list, weight, cost and warnings follow the choice, and both
  settings travel with the design and the walk video.
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
