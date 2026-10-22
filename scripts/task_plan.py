"""Compatibility entrypoint for task plan validation."""

from canopy.task_plan import (
    check_plan,
    dependency_fingerprint,
    fingerprint,
    iter_task_blocks,
    main,
    plan_request,
    validate_prepared,
)

__all__ = [
    "check_plan",
    "dependency_fingerprint",
    "fingerprint",
    "iter_task_blocks",
    "main",
    "plan_request",
    "validate_prepared",
]

if __name__ == "__main__":
    main()
