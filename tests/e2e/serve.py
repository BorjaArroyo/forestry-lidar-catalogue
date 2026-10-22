"""Serve the static application below a GitHub Pages-style path prefix."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
PREFIX = "/forestry-lidar-catalogue/"


class PagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        request_path = unquote(urlsplit(path).path)
        if request_path.startswith(PREFIX):
            request_path = request_path[len(PREFIX) :]
        elif request_path == PREFIX[:-1]:
            request_path = ""
        return str(ROOT / request_path)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4173), PagesHandler).serve_forever()
