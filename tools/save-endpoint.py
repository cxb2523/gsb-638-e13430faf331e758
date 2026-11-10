"""Local endpoint for the review tools: POST /save/<name> writes the body into exports/.

Run from the repo folder:  python3 tools/save-endpoint.py
Then in the browser console:  await __pixel.sheet('name', [[hour, weather, seconds], ...])  or  await __pixel.still('name', hour, weather)
"""
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "exports"
OUT.mkdir(exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5184")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        m = re.fullmatch(r"/save/([A-Za-z0-9._-]+)", self.path)
        if not m:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        (OUT / m.group(1)).write_bytes(data)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Saving review images to {OUT} (port 5185)")
    HTTPServer(("127.0.0.1", 5185), Handler).serve_forever()
