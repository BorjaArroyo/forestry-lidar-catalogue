"""Inspect an extracted Canopy export using Python and NumPy only."""

import argparse

from canopy.loader import LoaderConfig, open_dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", help="Extracted folder containing dataset.json")
    parser.add_argument(
        "--partition", action="append", help="Repeat to select published partitions"
    )
    parser.add_argument(
        "--source", action="append", help="Repeat to select source release references"
    )
    parser.add_argument(
        "--modality", action="append", help="Classification sensor, for example TLS"
    )
    parser.add_argument(
        "--field", action="append", help="Array name; associated masks are retained"
    )
    parser.add_argument("--block-points", type=int, default=65536)
    args = parser.parse_args()
    dataset = open_dataset(
        args.root,
        LoaderConfig(
            partitions=args.partition,
            sources=args.source,
            modalities=args.modality,
            fields=args.field,
            block_points=args.block_points,
        ),
    )
    print(dataset.info)
    print("Validating the complete export before reading a bounded sample...")
    print(dataset.validate())
    block = next(iter(dataset), None)
    if block is None:
        print("No observations match the selected filters.")
        return
    for key, value in block.items():
        if key == "arrays":
            for name, array in value.items():
                print(name, array.shape, array.dtype)
        else:
            print(key, value)
    # Storage blocks retain scene/observation context; they are not training samples.


if __name__ == "__main__":
    main()
