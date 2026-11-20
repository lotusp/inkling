"""Serve the built Muya trial and its local images on a loopback port."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import os
import re
import sys
import tempfile
import threading


media = (
    Path(sys.argv[3]).resolve()
    if len(sys.argv) > 3
    else Path.home() / ".inkling-muya-trial" / "images"
)
media.mkdir(mode=0o700, parents=True, exist_ok=True)
ready = threading.Condition()
asset_path = re.compile(r"/trial-images/([0-9a-f-]{36}\.(?:png|jpg|gif|webp))")
types = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def matches_type(data, kind):
    if kind == "png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if kind == "jpg":
        return data.startswith(b"\xff\xd8\xff")
    if kind == "gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


class Desk(SimpleHTTPRequestHandler):
    @property
    def host(self):
        return f"127.0.0.1:{self.server.server_port}"

    def asset(self):
        match = asset_path.fullmatch(urlsplit(self.path).path)
        return media / match[1] if match else None

    def do_PUT(self):
        path = self.asset()
        if (
            not path
            or self.headers.get("Origin") != f"http://{self.host}"
            or self.headers.get("Host") != self.host
        ):
            self.send_error(403)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= 32 * 1024 * 1024:
            self.send_error(413)
            return
        data = self.rfile.read(size)
        if len(data) != size or not matches_type(data, path.suffix[1:]):
            self.send_error(415)
            return
        with tempfile.NamedTemporaryFile(dir=media, delete=False) as tmp:
            tmp.write(data)
        try:
            with ready:
                try:
                    os.link(tmp.name, path)
                except FileExistsError:
                    self.send_error(409)
                    return
                ready.notify_all()
        finally:
            os.unlink(tmp.name)
        self.send_response(201)
        self.end_headers()

    def send_head(self):
        if self.headers.get("Host") != self.host:
            self.send_error(403)
            return None
        path = self.asset()
        if not path:
            return super().send_head()
        # The editor requests a preview while the same-origin upload finishes.
        with ready:
            ready.wait_for(path.exists, timeout=4)
        if not path.is_file():
            self.send_error(404)
            return None
        self.send_response(200)
        self.send_header("Content-Type", types[path.suffix[1:]])
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Cache-Control", "private, max-age=31536000, immutable")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        return path.open("rb")

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        pass


server = ThreadingHTTPServer(
    ("127.0.0.1", int(sys.argv[1])), partial(Desk, directory=sys.argv[2])
)
print(f"Inkling Muya trial: http://127.0.0.1:{server.server_port}/", flush=True)
server.serve_forever()
