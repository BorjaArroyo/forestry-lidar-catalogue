"""Read-only LAS inspection executed inside the Python OCI container."""

import hashlib
import json
import math
import platform
import struct
import sys

MAX_BYTES = 1024 * 1024
POINT_LENGTHS = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67]


def inspect(data):
    if len(data) > MAX_BYTES:
        raise ValueError("Prototype input limit is 1 MiB")
    if len(data) < 227 or data[:4] != b"LASF":
        raise ValueError("Expected an uncompressed LAS file")
    version = tuple(data[24:26])
    if version[0] != 1 or version[1] > 4:
        raise ValueError("Supported LAS versions are 1.0 through 1.4")
    header_size, offset = struct.unpack_from("<HI", data, 94)
    format_id, record_bytes, legacy_count = struct.unpack_from("<BHI", data, 104)
    if format_id & 0xC0:
        raise ValueError("LAZ/compressed LAS is outside this prototype")
    if format_id > 10 or record_bytes < POINT_LENGTHS[format_id]:
        raise ValueError("Unsupported point format or short point record")
    minimum_header = 375 if version[1] == 4 else 235 if version[1] == 3 else 227
    if header_size < minimum_header or offset < header_size or offset > len(data):
        raise ValueError("Invalid LAS header or point offset")
    if format_id >= 6 and version[1] != 4:
        raise ValueError("Point formats 6-10 require LAS 1.4")
    count = struct.unpack_from("<Q", data, 247)[0] if version[1] == 4 else legacy_count
    if offset + count * record_bytes > len(data):
        raise ValueError("Truncated point records")
    scale = struct.unpack_from("<ddd", data, 131)
    origin = struct.unpack_from("<ddd", data, 155)
    if not all(math.isfinite(v) for v in scale + origin) or not all(v > 0 for v in scale):
        raise ValueError("Invalid coordinate scales or offsets")
    low, high = [math.inf] * 3, [-math.inf] * 3
    finite = 0
    for index in range(count):
        xyz = struct.unpack_from("<iii", data, offset + index * record_bytes)
        decoded = [xyz[axis] * scale[axis] + origin[axis] for axis in range(3)]
        if all(math.isfinite(v) for v in decoded):
            finite += 1
            low = [min(a, b) for a, b in zip(low, decoded)]
            high = [max(a, b) for a, b in zip(high, decoded)]
    return {
        "operation": "las-coordinate-inspection:0.1.0",
        "input_sha256": hashlib.sha256(data).hexdigest(),
        "input_bytes": len(data),
        "las_version": "%d.%d" % version,
        "point_format": format_id,
        "record_bytes": record_bytes,
        "point_count": count,
        "finite_xyz_points": finite,
        "bounds": {"min": low, "max": high} if finite else None,
        "scale": scale,
        "offset": origin,
        "environment": {
            "python": platform.python_version(),
            "system": platform.system(),
            "machine": platform.machine(),
        },
        "scope": "Coordinate inspection only. No source modified, labels mapped, CRS inferred or dataset prepared.",
    }


if __name__ == "__main__":
    try:
        with open(sys.argv[1], "rb") as source:
            data = source.read(MAX_BYTES + 1)
        print(
            "CANOPY_RESULT=" + json.dumps({"ok": True, "report": inspect(data)}, allow_nan=False),
            flush=True,
        )
    except Exception as error:
        print("CANOPY_RESULT=" + json.dumps({"ok": False, "error": str(error)}), flush=True)
        sys.exit(1)
