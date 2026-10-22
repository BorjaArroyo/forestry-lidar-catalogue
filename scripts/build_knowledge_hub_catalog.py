"""Compatibility entrypoint for catalog generation."""

from canopy.build_knowledge_hub_catalog import CONTENT, PROFILES, build, main

__all__ = ["CONTENT", "PROFILES", "build", "main"]

if __name__ == "__main__":
    main()
