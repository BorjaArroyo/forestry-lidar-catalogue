"""Compatibility entrypoint for task package validation and inspection."""

from canopy.task_package import (
    PROFILE,
    REPO,
    TaskPackage,
    inside,
    main,
    read_json,
    sha_file,
)

__all__ = ["PROFILE", "REPO", "TaskPackage", "inside", "main", "read_json", "sha_file"]

if __name__ == "__main__":
    main()
