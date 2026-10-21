"""Check pinned local runtime assets and the explicit publication allowlist."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check(root=ROOT, *, write=False):
    """Refresh only already-listed local artifacts; never change remote pins."""
    failures = []
    for filename in ['browser-prepare/runtime-lock.json', 'publication-manifest.json']:
        path = root / filename
        document = json.loads(path.read_text())
        for name, entry in document['files'].items():
            relative = entry['url'] if isinstance(entry, dict) else name
            if relative.startswith('https://'):
                continue
            artifact = root / relative
            if artifact.is_symlink() or not artifact.resolve().is_relative_to(root.resolve()):
                raise ValueError('Pinned artifact escapes repository: ' + relative)
            raw = artifact.read_bytes()
            expected = {'sha256': hashlib.sha256(raw).hexdigest(), 'size_bytes': len(raw)}
            if isinstance(entry, dict):
                changed = any(entry.get(key) != value for key, value in expected.items())
                if write:
                    entry.update(expected)
            else:
                changed = entry != expected['sha256']
                if write:
                    document['files'][name] = expected['sha256']
            if changed:
                failures.append(filename + ': ' + name)
        if write:
            path.write_text(json.dumps(document, indent=2) + '\n')
    if failures and not write:
        raise ValueError('Stale fingerprints:\n' + '\n'.join(failures))
    return len(failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Explicitly refresh existing local fingerprints')
    args = parser.parse_args()
    changed = check(write=args.write)
    print(f'Publication fingerprints refreshed: {changed}' if args.write else 'Publication fingerprints verified')


if __name__ == '__main__':
    main()
