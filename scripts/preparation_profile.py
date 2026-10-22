"""Compatibility entrypoint for reviewed preparation profile dispatch."""

from canopy.preparation_profile import (
    RECORD_ID,
    command,
    open_package,
    require_record,
    status,
    validate_input,
)

__all__ = ["RECORD_ID", "command", "open_package", "require_record", "status", "validate_input"]
