"""Allow the installed CLI to run through the active Python interpreter."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
