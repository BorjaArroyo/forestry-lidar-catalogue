"""Command-line entrypoint for the local Canopy service and durable worker."""

import argparse
from http.server import ThreadingHTTPServer
from pathlib import Path

from .app import Service


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--worker", type=Path)
    args = parser.parse_args(argv)
    service = Service()
    if args.worker:
        service.worker(args.worker)
    else:
        service.STATE.mkdir(parents=True, exist_ok=True)
        print(f"Canopy workbench: http://127.0.0.1:{args.port}", flush=True)
        ThreadingHTTPServer(("127.0.0.1", args.port), service.Handler).serve_forever()


if __name__ == "__main__":
    main()
