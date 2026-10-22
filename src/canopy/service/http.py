"""HTTP transport for the loopback-only Canopy workbench service."""

import json
import secrets
import traceback
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .storage import RequestError


def parse_request(headers, stream):
    """Parse only the request; execution and persisted data errors remain internal."""
    try:
        size = int(headers.get("Content-Length", "0"))
        if not 1 <= size <= 16384:
            raise ValueError("Invalid request size")
        body = json.loads(stream.read(size))
        if not isinstance(body, dict):
            raise ValueError("The request must be a JSON object")
        return body
    except (ValueError, UnicodeError) as error:
        raise RequestError(str(error)) from error


def create_handler(api):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(api.WEB), **kwargs)

        def send_json(self, data, status=200):
            raw = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def local(self):
            return self.headers.get("Host") in {
                f"127.0.0.1:{self.server.server_port}",
                f"localhost:{self.server.server_port}",
            }

        def do_GET(self):
            if not self.local():
                return self.send_json({"error": "Invalid host"}, 403)
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/api/state":
                    with api.GUARD:
                        current_jobs = [
                            j for j in api.jobs() if j["kind"] in {"acquire", "prepare-instances"}
                        ]
                    try:
                        preparation = api.preparation_status()
                    except (ValueError, OSError) as e:
                        preparation = {"available": False, "detail": str(e)}
                    return self.send_json(
                        {
                            "token": api.TOKEN,
                            "jobs": current_jobs,
                            "preparation": preparation,
                            "records": [
                                {"id": r["record_id"], "title": r["title"]} for r in api.records()
                            ],
                        }
                    )
                if parsed.path == "/api/log":
                    jid = parse_qs(parsed.query).get("id", [""])[0]
                    folder = api.job_path(jid).parent
                    job = api.read(folder / "job.json")
                    if job["kind"] not in {"acquire", "prepare-instances"}:
                        raise ValueError("Historical experiments are outside this build")
                    p = folder / "worker.log"
                    with p.open("rb") as f:
                        f.seek(max(0, p.stat().st_size - 32000))
                        log = f.read().decode(errors="replace")
                    folder = p.parent
                    reports = {q.name: api.read(q) for q in folder.glob("*report.json")}
                    return self.send_json({"log": log, "reports": reports})
                if parsed.path.startswith("/api/"):
                    return self.send_json({"error": "Unknown endpoint"}, 404)
                # Serve only the public application, never job files or repository paths.
                relative = Path(parsed.path.lstrip("/") or "index.html")
                path = (api.WEB / relative).resolve()
                public_files = api.read(api.WEB / "publication-manifest.json")["files"]
                if not path.is_relative_to(api.WEB) or not path.is_file():
                    return self.send_json({"error": "Not found"}, 404)
                name = path.relative_to(api.WEB).as_posix()
                if name not in public_files and name != "publication-manifest.json":
                    return self.send_json({"error": "Not found"}, 404)
                if path.name == "index.html":
                    raw = path.read_bytes().replace(
                        b"window.CANOPY_PUBLIC = true;", b"window.CANOPY_PUBLIC = false;"
                    )
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(raw)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(raw)
                    return
                super().do_GET()
            except RequestError as e:
                self.send_json({"error": str(e)}, 400)
            except Exception:
                traceback.print_exc()
                self.send_json({"error": "Internal service error"}, 500)

        def do_POST(self):
            origin = self.headers.get("Origin")
            if (
                not self.local()
                or origin
                not in {
                    None,
                    f"http://127.0.0.1:{self.server.server_port}",
                    f"http://localhost:{self.server.server_port}",
                }
                or not secrets.compare_digest(self.headers.get("X-Canopy-Token", ""), api.TOKEN)
            ):
                return self.send_json({"error": "Local session token required"}, 403)
            try:
                body = parse_request(self.headers, self.rfile)
                if self.path == "/api/inspect":
                    if "record" not in body:
                        raise RequestError("Missing record")
                    return self.send_json(api.inspect_record(body["record"]))
                if self.path == "/api/jobs":
                    return self.send_json(api.submit(body), 202)
                self.send_json({"error": "Unknown endpoint"}, 404)
            except RequestError as e:
                self.send_json({"error": str(e)}, 400)
            except Exception:
                traceback.print_exc()
                self.send_json({"error": "Internal service error"}, 500)

    return Handler
