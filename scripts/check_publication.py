"""Compatibility entrypoint for publication integrity checks."""

from canopy.tools.check_publication import check, main

__all__ = ["check", "main"]

if __name__ == "__main__":
    main()
