"""Compatibility entrypoint for pinned source checks."""

from canopy.tools.check_pinned_sources import check, main

__all__ = ["check", "main"]

if __name__ == "__main__":
    main()
