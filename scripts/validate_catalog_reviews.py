"""Compatibility entrypoint for catalog admission review validation."""

from canopy.tools.validate_catalog_reviews import fingerprint, main, validate

__all__ = ["fingerprint", "main", "validate"]

if __name__ == "__main__":
    main()
