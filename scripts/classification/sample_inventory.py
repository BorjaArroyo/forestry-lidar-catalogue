"""Bounded remote ZIP directory inspection and fixed, small native fixtures.

Does not verify entire provider ZIPs and never changes executable admission.
"""
import argparse
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path
from classification.snapshot import HERE, ROOT, FOR, BIODIV, write


class RangeFile(io.RawIOBase):
    def __init__(self, asset):
        self.asset, self.pos, self.received = asset, 0, 0

    def seekable(self):
        return True

    def seek(self, offset, whence=0):
        self.pos = offset + (self.pos if whence == 1 else self.asset['size_bytes'] if whence == 2 else 0)
        if self.pos < 0:
            raise ValueError('Invalid byte range')
        return self.pos

    def tell(self):
        return self.pos

    def read(self, size=-1):
        size = min(size if size >= 0 else self.asset['size_bytes'], self.asset['size_bytes'] - self.pos)
        if not size:
            return b''
        if self.received + size > 32 * 1024**2:
            raise ValueError('Sample inspection exceeded 32 MiB network bound')
        request = urllib.request.Request(self.asset['url'], headers={'Range':f'bytes={self.pos}-{self.pos+size-1}'})
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status != 206 or response.headers.get('Content-Range') != f'bytes {self.pos}-{self.pos+size-1}/{self.asset["size_bytes"]}':
                raise ValueError('Provider did not return exact requested byte range')
            data = response.read(size+1)
        if len(data) != size:
            raise ValueError('Truncated range')
        self.received += size
        self.pos += size
        return data


def main():
    import laspy
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'temp/classification')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    lock = json.loads((HERE/'source-lock.json').read_text())
    trees = json.loads((HERE/'trees.json').read_text())['trees']
    by_id = {t['tree_id']:t for t in trees if t['source_ref'] == FOR and t['published_split']=='dev'}
    source = next(s for s in lock['sources'] if s['source_ref']==FOR)
    inventory, samples, issues = [], [], []
    for asset in source['assets']:
        if not asset['name'].endswith('.zip'):
            continue
        remote = RangeFile(asset)
        with zipfile.ZipFile(remote) as archive:
            members = archive.infolist()
            names = [m.filename for m in members]
            if len(names) != len(set(names)):
                raise ValueError('Duplicate ZIP names')
            seen = set()
            for member in members:
                if member.is_dir():
                    continue
                match = re.fullmatch(r'(?:.*/)?(\d+)\.(las|laz)', member.filename, re.I)
                if not match:
                    issues.append(dict(archive=asset['name'], path=member.filename, issue='non-cloud-member',
                                       size_bytes=member.file_size,compressed_size=member.compress_size,
                                       crc32=f'{member.CRC:08x}',header_offset=member.header_offset))
                    continue
                tree_id = str(int(match[1]))
                if tree_id in seen:
                    raise ValueError('Ambiguous filename/tree join: '+tree_id)
                seen.add(tree_id)
                tree = by_id.get(tree_id) if asset['name']=='dev.zip' else None
                row = dict(path=member.filename, tree_id=tree_id, archive=asset['name'],
                           size_bytes=member.file_size, compressed_size=member.compress_size,
                           crc32=f'{member.CRC:08x}', published_split=asset['name'][:-4],
                           modality=tree['modalities'][0] if tree else 'unknown',
                           collection=tree['collection'] if tree else 'unknown',
                           header_offset=member.header_offset, label_matched=tree is not None)
                inventory.append(row)
            # Fix the smallest complete clouds per modality, plus unlabelled test.
            partitions = [r for r in inventory if r['archive']==asset['name']]
            groups = ['TLS','MLS','ULS'] if asset['name']=='dev.zip' else ['unknown']
            for modality in groups:
                row = min((r for r in partitions if r['modality']==modality), key=lambda r:r['size_bytes'])
                data = archive.read(row['path'])
                dest=args.output/(asset['name'][:-4]+'-'+Path(row['path']).name)
                dest.write_bytes(data)
                with laspy.open(io.BytesIO(data)) as cloud:
                    points=cloud.read_points(cloud.header.point_count)
                    row.update(points=cloud.header.point_count, sha256=hashlib.sha256(data).hexdigest(),
                               point_format=cloud.header.point_format.id, point_record_length=cloud.header.point_format.size,
                               native_records_sha256=hashlib.sha256(points.array.tobytes()).hexdigest(),
                               scales=list(cloud.header.scales), offsets=list(cloud.header.offsets),
                               attributes=list(cloud.header.point_format.dimension_names))
                samples.append(dict(source_ref=FOR, **row))
                print(json.dumps(samples[-1]),flush=True)
            if asset['name']=='dev.zip':
                missing=sorted(set(by_id)-seen)
                unmatched=sorted(seen-set(by_id))
                issues.append(dict(archive=asset['name'], missing_label_members=missing, unlabelled_members=unmatched,
                    join_rule='Decimal treeID equals the numeric member basename; CSV filename retained verbatim'))
    report=dict(schema_version='1.0.0',scope='Complete ZIP central directories and bounded native payload samples; whole ZIP MD5 unchecked',
                members=inventory,issues=issues)
    write(ROOT/'evidence/classification/for-member-inventory.json',report)
    acceptance_path=ROOT/'evidence/classification/acceptance-manifest.json'
    previous=json.loads(acceptance_path.read_text()) if acceptance_path.exists() else {}
    manifest=dict(schema_version='1.0.0',
          status='for-samples-fixed-biodiv-pending',frozen_before_adapters=True, samples=samples,
          required_scenarios=['FOR TLS/MLS/ULS', 'BioDiv paired TLS/ULS with complete and genus-only reference',
                              'published validate and test', 'unassigned inference', 'mixed sources in Chromium and Firefox'],
          pending=['BioDiv native samples and all-source totals', 'Full audit on Ray deferred by user'])
    if previous:
        manifest.update({key:value for key,value in previous.items() if key!='samples'})
    write(acceptance_path,manifest)


if __name__=='__main__':
    main()
