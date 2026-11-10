"""Serve the Pixel Engine on http://localhost:5184 without browser caching.

Run from the repo folder:  python3 tools/serve.py
A plain `python3 -m http.server` lets Chrome cache the JS modules, so edits can look like they did nothing.
"""
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("Pixel Engine on http://localhost:5184")
    # localhost only, so the dev server is not reachable from the rest of the network
    http.server.ThreadingHTTPServer(("127.0.0.1", 5184), functools.partial(Handler, directory=str(ROOT))).serve_forever()
