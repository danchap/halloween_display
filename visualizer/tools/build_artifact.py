#!/usr/bin/env python3
"""Turn index.html into the body-only page that claude.ai Artifacts expect.

The Artifact service wraps a page in its own <!doctype>/<head>/<body>, so
the published file holds the <title>, the <style> and the body content
only, in that order. The page's scripts and data are published next to it
as files, referenced by the same relative paths as locally.

    python3 tools/build_artifact.py OUT.html   writes the page
    python3 tools/build_artifact.py --files    lists the files to publish
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # visualizer/

FILES = [
    "app.js", "spider.js", "site.js", "scene.js", "walk.js", "textures.js",
    "vendor/three.module.js",
    "site/site.json", "site/ortho.jpg", "site/sprites/plants.json",
    "site/sprites/plant-shrub.png", "site/sprites/plant-hollyhock.png",
    "site/sprites/plant-flowers.png", "site/sprites/plant-bush.png",
]


def build():
    html = (HERE / "index.html").read_text(encoding="utf-8")
    title = re.search(r"<title>.*?</title>", html, re.S).group(0)
    style = re.search(r"<style>.*?</style>", html, re.S).group(0)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    # Hosted: no URL hash, no downloads; app.js hides the local-only buttons.
    tag = '<script type="importmap">'
    assert tag in body, "index.html: importmap tag not found; the hosted flag would be missing"
    body = body.replace(tag, '<script>window.HOSTED = true;</script>\n' + tag, 1)
    out = title + "\n" + style + "\n" + body.strip() + "\n"
    assert 'window.HOSTED' in out
    return out


if __name__ == "__main__":
    if "--files" in sys.argv:
        for f in FILES:
            assert (HERE / f).exists(), f
            print(f)
    else:
        out = Path(sys.argv[1])
        out.write_text(build(), encoding="utf-8")
        print("wrote", out, out.stat().st_size, "bytes")
