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
  walk URL as its first tab (`?record=1&upload=<name>`); a tab opened
  through the debugging port is throttled and never finishes. The page
  posts progress to the server's stdout via /log. feta has no ffmpeg.
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
- Put screenshots and Chrome profiles under visualizer/out/ (ignored), not
  /tmp: /tmp is a quota-limited tmpfs shared with other sessions. Pass
  `--user-data-dir=out/chrome --disk-cache-size=1` to headless Chrome or
  it renders stale scripts.
- Headless check: serve, then
  `google-chrome --headless=new --no-sandbox --use-angle=swiftshader
  --enable-unsafe-swiftshader --virtual-time-budget=15000 --dump-dom
  http://127.0.0.1:8765/tests.html` and look for ALL PASSED; the same flags
  with `--screenshot` render the page.

## Still open (ask Daniel)

- Absolute size (L), knee bend and leg thickness: the visualizer exists to
  decide these. Materials and construction are not started.
- Power, weather, how the spider is hung and how the feet fix to the walls.

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
