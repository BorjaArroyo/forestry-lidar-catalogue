"""Provider-independent release identities, retaining legacy Zenodo identifiers."""
import re


def source_ref(value):
    value = str(value)
    if re.fullmatch(r'[1-9][0-9]*', value):
        return 'zenodo:' + value
    if re.fullmatch(r'zenodo:[1-9][0-9]*|grodata:[1-9][0-9]*:[0-9]+\.[0-9]+', value):
        return value
    raise ValueError('INVALID_SOURCE_REF: expected a pinned source release')


def source_folder(value):
    return source_ref(value).replace(':', '-')
