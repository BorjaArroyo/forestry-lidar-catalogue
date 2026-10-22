"""Canonical JSON shared with the browser (integral floats serialize as integers)."""
import hashlib
import json


def normalized(value):
    if isinstance(value,float) and value.is_integer():
        return int(value)
    if isinstance(value,dict):
        return {k:normalized(v) for k,v in value.items()}
    if isinstance(value,list):
        return [normalized(v) for v in value]
    return value


def fingerprint(value):
    return hashlib.sha256(json.dumps(normalized(value),sort_keys=True,separators=(',', ':'),
                                    ensure_ascii=False,allow_nan=False).encode()).hexdigest()
