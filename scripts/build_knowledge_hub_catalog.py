"""Compatibility entrypoint for catalog generation."""

from canopy.tools.build_knowledge_hub_catalog import CONTENT, build, main

__all__ = ["CONTENT", "build", "main"]

if __name__ == "__main__":
    main()
