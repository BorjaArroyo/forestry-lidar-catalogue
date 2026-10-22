"""Compatibility entrypoint for task dataset composition and validation."""

from canopy.task_dataset import TaskDataset, export_dataset, main

__all__ = ["TaskDataset", "export_dataset", "main"]

if __name__ == "__main__":
    main()
