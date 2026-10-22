"""Run the repository's read-only validation suite from one stable entrypoint."""

from pathlib import Path
import os
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def steps():
    """Build the checks from discovered tests so new tests join automatically."""
    python = sys.executable
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to run the JavaScript checks")

    javascript_tests = sorted(
        path.relative_to(ROOT).as_posix() for path in (ROOT / "tests").rglob("test_*.mjs")
    )
    return [
        ("Validate the curated knowledge model", [python, "scripts/knowledge_model.py"]),
        ("Validate publication fingerprints", [python, "scripts/check_publication.py"]),
        ("Check Python style", [python, "-m", "ruff", "check", "."]),
        ("Check Python formatting", [python, "-m", "ruff", "format", "--check", "."]),
        ("Check JavaScript style", ["npm", "run", "lint"]),
        ("Check formatting", ["npm", "run", "format:check"]),
        (
            "Run Python tests",
            [python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
        ),
        (
            "Run the self-contained FOR-instance pipeline tests",
            [python, "scripts/for_instance/test_pipeline.py"],
        ),
        ("Run JavaScript tests", [node, "--test", *javascript_tests]),
        ("Run real-browser tests", ["npm", "run", "test:e2e"]),
    ]


def main():
    """Run every check without refreshing artifacts or rewriting source files."""
    environment = os.environ.copy()
    environment["CANOPY_PYTHON"] = sys.executable
    source_root = str(ROOT / "src")
    environment["PYTHONPATH"] = os.pathsep.join(
        part for part in (source_root, environment.get("PYTHONPATH", "")) if part
    )
    try:
        for label, command in steps():
            print(f"\n== {label} ==", flush=True)
            subprocess.run(command, cwd=ROOT, env=environment, check=True)
    except (OSError, RuntimeError) as error:
        print(f"Verification could not start: {error}", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as error:
        print(
            f"Verification failed in '{label}' (exit code {error.returncode})",
            file=sys.stderr,
        )
        return error.returncode or 1
    print("\nAll repository checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
