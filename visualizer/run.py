#!/usr/bin/env python3
"""Serve the spider visualizer on localhost and open it in the browser.

The page uses JavaScript modules, which browsers refuse to load from file://
URLs, so it needs a web server. This one is the standard library's; nothing
is installed. Stop it with Ctrl-C.

    python3 run.py              serve and open the browser
    python3 run.py --no-browser serve only (prints the URL)
    python3 run.py --port 8123  pick the port (default: first free from 8765)

Recorded videos from the walk page land in out/ next to this script when
the page is opened with ?record=1&upload=<name>.
"""
import argparse
import functools
import http.server
import re
import socket
import threading
import urllib.parse
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent


def free_port(start):
    for port in range(start, start + 50):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("no free port found from %d" % start)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
    }

    def log_message(self, fmt, *args):  # only report errors
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)

    def do_GET(self):
        """/log?m=<text> prints a line from the page; everything else is a file."""
        url = urllib.parse.urlparse(self.path)
        if url.path == "/log":
            msg = urllib.parse.parse_qs(url.query).get("m", [""])[0]
            print("page:", msg, flush=True)
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        """The walk page posts a recorded video to /upload?name=<file>."""
        url = urllib.parse.urlparse(self.path)
        name = Path(urllib.parse.parse_qs(url.query).get("name", ["recording.mp4"])[0]).name
        if url.path != "/upload" or not re.fullmatch(r"[A-Za-z0-9][\w.-]*", name):
            self.send_error(400, "upload name must be a plain file name")
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.send_error(411, "Content-Length required")
            return
        out = HERE / "out"
        out.mkdir(exist_ok=True)
        written = 0
        with open(out / name, "wb") as f:
            while written < length:
                chunk = self.rfile.read(min(1 << 20, length - written))
                if not chunk:
                    break
                f.write(chunk)
                written += len(chunk)
        if written != length:
            (out / name).unlink(missing_ok=True)
            self.send_error(400, "upload truncated: %d of %d bytes" % (written, length))
            return
        print("saved", out / name, "(%d bytes)" % written, flush=True)
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    port = args.port or free_port(8765)
    handler = functools.partial(QuietHandler, directory=str(HERE))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = "http://127.0.0.1:%d/" % port
    print("Spider visualizer at", url, "(Ctrl-C to stop)")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
