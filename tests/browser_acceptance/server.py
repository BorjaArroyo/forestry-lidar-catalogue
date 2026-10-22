"""Serve the public allowlist and explicit acceptance files on loopback only."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
ACCEPTANCE_FILES = {
    "tests/browser_acceptance/" + name for name in ["index.html", "harness.js", "selection.json"]
}
RESERVE = 64 * 1024**2


def handler(output):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def allowed(self):
            name = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
            if name.endswith("/"):
                name += "index.html"
            allowed = (
                set(json.loads((ROOT / "publication-manifest.json").read_text())["files"])
                | ACCEPTANCE_FILES
                | {"publication-manifest.json"}
            )
            if name not in allowed:
                return False
            return True

        def do_GET(self):
            if not self.allowed():
                return self.send_error(404)
            super().do_GET()

        def do_HEAD(self):
            if not self.allowed():
                return self.send_error(404)
            super().do_HEAD()

        def do_POST(self):
            if self.headers.get("Origin") != f"http://127.0.0.1:{self.server.server_port}":
                return self.send_error(403)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if self.path == "/acceptance/events" and 0 < size <= 2 * 1024**2:
                    event = json.loads(self.rfile.read(size))
                    with (output / "events.jsonl").open("a") as stream:
                        stream.write(json.dumps(event, allow_nan=False) + "\n")
                elif (
                    re.fullmatch(r"/acceptance/archive/[0-9a-f-]{36}", self.path)
                    and 0 < size <= 2 * 1024**3
                ):
                    path = output / (self.path.rsplit("/", 1)[-1] + ".zip")
                    if path.exists():
                        return self.send_error(
                            409, "Archive already captured; choose a new output directory"
                        )
                    if shutil.disk_usage(output).free < size + RESERVE:
                        return self.send_error(
                            507, "Insufficient space for the captured ZIP plus reserve"
                        )
                    partial = path.with_suffix(".zip.incomplete")
                    with partial.open("xb") as stream:
                        remaining = size
                        while remaining:
                            block = self.rfile.read(min(remaining, 1024**2))
                            if not block:
                                raise EOFError("Incomplete archive capture")
                            stream.write(block)
                            remaining -= len(block)
                    partial.rename(path)
                else:
                    return self.send_error(400)
            except (ValueError, OSError, EOFError) as error:
                return self.send_error(400, str(error))
            self.send_response(201)
            self.end_headers()

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8893)
    parser.add_argument(
        "--output", type=Path, required=True, help="New directory dedicated to one test browser"
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(args.output.resolve()))
    print(f"Acceptance: http://127.0.0.1:{args.port}/tests/browser_acceptance/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
