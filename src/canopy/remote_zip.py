"""Seekable, bounded HTTP ranges for inspecting a pinned remote ZIP asset."""

import io
import urllib.request


class RemoteZipFile(io.RawIOBase):
    """Refuse full-response fallbacks, oversized reads and excessive transfers."""

    def __init__(self, asset, *, max_bytes=512 * 1024**2, range_bytes=2 * 1024**2):
        self.asset = asset
        self.position = 0
        self.received = 0
        self.max_bytes = max_bytes
        self.range_bytes = range_bytes

    def seekable(self):
        return True

    def seek(self, offset, whence=0):
        base = {0: 0, 1: self.position, 2: self.asset["size_bytes"]}
        if whence not in base or not 0 <= base[whence] + offset <= self.asset["size_bytes"]:
            raise ValueError("Invalid ZIP byte offset")
        self.position = base[whence] + offset
        return self.position

    def tell(self):
        return self.position

    def read(self, size=-1):
        remaining = self.asset["size_bytes"] - self.position
        size = remaining if size < 0 else min(size, remaining)
        if self.received + size > self.max_bytes:
            raise ValueError("Remote ZIP transfer exceeds its declared budget")
        output = bytearray()
        while len(output) < size:
            length = min(size - len(output), self.range_bytes)
            end = self.position + length - 1
            request = urllib.request.Request(
                self.asset["url"],
                headers={"Range": f"bytes={self.position}-{end}", "Accept-Encoding": "identity"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                if response.status != 206 or response.headers.get("Content-Range") != (
                    f"bytes {self.position}-{end}/{self.asset['size_bytes']}"
                ):
                    raise ValueError("Provider did not return the exact requested ZIP range")
                data = response.read(length + 1)
            if len(data) != length:
                raise ValueError("Truncated ZIP byte range")
            output.extend(data)
            self.position += length
            self.received += length
        return bytes(output)
