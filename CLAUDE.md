# CLAUDE.md

Halloween Display is a project for Daniel (GitHub user danchap), started
2026-10-03. Nothing about it is decided yet, not even what kind of display.
The first job is to ask Daniel what he wants to make, before buying anything,
writing code or designing anything.

## Deadline

Halloween is 2026-10-31, four weeks after the start. Plan back from that date:
parts that have to be ordered need shipping time, and anything built needs a
test run before the night.

## Open questions (ask Daniel; do not assume)

- What the display is. It could be a physical prop with lights, sound or
  movement (a microcontroller such as an Arduino, ESP32 or Raspberry Pi
  driving LEDs, a speaker, a motion sensor or servos), a projection or screen
  display, something printed or built by hand, or software.
- Where it goes (indoors, a window, the yard), what power is available there,
  and whether it must survive weather.
- Budget, and what Daniel already owns (boards, LEDs, speakers, a 3D printer,
  a projector).

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

- Created 2026-10-03 with README.md, CLAUDE.md and .gitignore.
- The remote is git@github.com:danchap/halloween_display.git. Once Daniel
  has created that repo on GitHub (empty, private), run `git push -u origin main`.
