"""Single integration boundary for unchanged, self-contained scientific sources."""

from functools import lru_cache
import importlib.util

from .paths import repository_root


@lru_cache(maxsize=None)
def load_adapter(name):
    """Load a reviewed implementation by path without changing normal import lookup."""
    sources = {
        "for_instance": "for_instance/prepare.py",
        "fgi_emit": "fgi_emit/prepare.py",
        "audit_fgi_measurements": "audit_fgi_measurements.py",
    }
    if name not in sources:
        raise ValueError(f"Unknown protected adapter: {name}")
    path = repository_root() / "scripts" / sources[name]
    spec = importlib.util.spec_from_file_location(f"_canopy_adapter_{name}", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Adapter implementation is missing or unreadable: {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
