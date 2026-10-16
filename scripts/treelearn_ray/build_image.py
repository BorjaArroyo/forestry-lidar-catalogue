"""Assemble an audited TreeLearn build context from a pinned upstream commit."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tarfile

COMMIT = "fd240ce7caa4c444fe3418aca454dc578bc557d4"
UPSTREAM = "https://github.com/ecker-lab/TreeLearn.git"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--source", type=Path, help="Existing upstream clone, otherwise fetch the pinned public source")
    parser.add_argument("--tag", default="canopy-treelearn-ray:fd240ce-cu118-ray2551-r5")
    args = parser.parse_args()
    context = args.context.resolve()
    context.mkdir(parents=True, exist_ok=False)
    package = Path(__file__).resolve().parent
    source = args.source.resolve() if args.source else context / "upstream.git"
    if not args.source:
        subprocess.run(["git", "init", "--bare", str(source)], check=True)
        subprocess.run(["git", "-C", str(source), "fetch", "--depth", "1", UPSTREAM, COMMIT], check=True)
    actual = subprocess.check_output(["git", "-C", str(source), "rev-parse", COMMIT + "^{commit}"], text=True).strip()
    if actual != COMMIT:
        raise RuntimeError("Upstream commit mismatch")
    archive = context / "source.tar"
    with archive.open("wb") as stream:
        subprocess.run(["git", "-C", str(source), "archive", COMMIT], stdout=stream, check=True)
    with tarfile.open(archive) as bundle:
        # A pinned public Git tree is the only source; refuse non-regular archive paths.
        for member in bundle.getmembers():
            path = Path(member.name)
            if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError("Unexpected path or link in the upstream archive")
        bundle.extractall(context / "TreeLearn", filter="data")
    archive.unlink()
    if not args.source:
        shutil.rmtree(source)
    for name in ("Dockerfile", "requirements.txt", "driver.py", "partition_policy.py", "inference_check.py", "full_forest.py", "checkpoint-lock.json"):
        shutil.copyfile(package / name, context / name)
    subprocess.run(["docker", "buildx", "build", "--builder", "default", "--platform", "linux/amd64",
                    "--load", "--tag", args.tag, "--metadata-file", str(context.parent / (context.name + "-build.json")), str(context)], check=True)


if __name__ == "__main__":
    main()
