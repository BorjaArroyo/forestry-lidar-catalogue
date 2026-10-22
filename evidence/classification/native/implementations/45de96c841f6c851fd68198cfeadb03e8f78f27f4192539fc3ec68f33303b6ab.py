"""Audit complete original archives and create native per-observation references.

Run against original downloaded files. Point data stays outside the repository.
No source is enabled automatically. The Ray run is deliberately not implicit.
"""
import argparse
import hashlib
import json
import os
import re
import resource
import shutil
import tarfile
import tempfile
import time
import zipfile
from pathlib import Path

from classification.model import safe_path
from classification.snapshot import HERE, FOR, BIODIV, write


def hash_file(path, algorithm='sha256'):
    digest = hashlib.new(algorithm)
    with Path(path).open('rb') as stream:
        for data in iter(lambda: stream.read(1024**2), b''):
            digest.update(data)
    return digest.hexdigest()


def inspect_cloud(path, *, source, member, archive, trees, decoded_cache=None):
    import laspy
    import numpy as np
    safe_path(member)
    basename=Path(member).name
    if source==FOR:
        match=re.fullmatch(r'(\d+)\.la[sz]',basename,re.I)
        if not match:
            raise ValueError('UNKNOWN_CLOUD_ID: '+member)
        tree_id=str(int(match[1])); modality=None
    else:
        match=re.fullmatch(r'(.+)_(TLS|ULS)\.la[sz]',basename)
        if not match:
            raise ValueError('UNKNOWN_CLOUD_ID: '+member)
        tree_id,modality=match.groups()
    tree=trees.get((source,tree_id))
    if tree is None and not (source==FOR and archive=='test.zip'):
        raise ValueError('CLOUD_WITHOUT_LABEL_ROW: '+member)
    if source==FOR:
        modality=tree['modalities'][0] if tree else 'unknown'
    digest=hash_file(path)
    if decoded_cache is not None and digest in decoded_cache:
        previous=decoded_cache[digest]
        return dict(previous,source_ref=source,tree_id=tree_id,
                    observation_id=tree_id+':'+modality+':'+member,modality=modality,path=member,archive=archive,
                    published_split=tree['published_split'] if tree else 'test',collection=tree['collection'] if tree else 'unknown')
    records,xyz=hashlib.sha256(),hashlib.sha256()
    chunks=[]; offset=0
    with laspy.open(path) as reader:
        for points in reader.chunk_iterator(250000):
            raw=points.array.tobytes(); coordinates=np.column_stack([points.x,points.y,points.z]).astype('<f8')
            if not np.isfinite(coordinates).all():
                raise ValueError('NONFINITE_NATIVE_XYZ')
            records.update(raw); xyz.update(coordinates.tobytes())
            chunks.append(dict(offset=offset,points=len(points),native_records_sha256=hashlib.sha256(raw).hexdigest(),
                               xyz_sha256=hashlib.sha256(coordinates.tobytes()).hexdigest()))
            offset+=len(points)
        header=reader.header
        if offset!=header.point_count or not offset:
            raise ValueError('NATIVE_POINT_COUNT_MISMATCH')
        result=dict(source_ref=source,tree_id=tree_id,observation_id=tree_id+':'+modality+':'+member,
                    modality=modality,path=member,archive=archive,size_bytes=Path(path).stat().st_size,
                    sha256=digest,points=offset,point_record_length=header.point_format.size,
                    point_format=header.point_format.id,native_records_sha256=records.hexdigest(),
                    xyz_sha256=xyz.hexdigest(),chunks=chunks,
                    published_split=tree['published_split'] if tree else 'test',
                    collection=tree['collection'] if tree else 'unknown',
                    native_schema=dict(las_version=str(header.version),fields=header.point_format.dtype().descr,
                        scales_hex=[float(x).hex() for x in header.scales],offsets_hex=[float(x).hex() for x in header.offsets],
                        attributes=list(header.point_format.dimension_names)))
    if decoded_cache is not None:decoded_cache[digest]=result
    return result


def audit_archive(path, source, asset, trees, staging, *, retained=None):
    import zstandard
    path=Path(path)
    started=time.monotonic();before=path.stat()
    if before.st_size!=asset['size_bytes'] or 'md5:'+hash_file(path,'md5')!=asset['checksum']:
        raise ValueError('ARCHIVE_CHECKSUM_MISMATCH: '+asset['name'])
    observations=[]; members=[]; seen=set();nested=[];decoded={};last=time.monotonic()
    staging=Path(staging);staging.mkdir(parents=True,exist_ok=True)
    retained=Path(retained) if retained else None
    cache_path=staging/'observations.jsonl';cached={}
    contract=dict(source_ref=source,asset=asset,implementation_sha256=hash_file(__file__))
    (staging/'implementation.py').write_bytes(Path(__file__).read_bytes())
    contract_path=staging/'audit-input.json'
    if contract_path.exists() and json.loads(contract_path.read_text())!=contract:
        raise ValueError('AUDIT_CHECKPOINT_CHANGED: choose a fresh staging folder')
    write(contract_path,contract)
    if cache_path.exists():
        with cache_path.open('rb+') as stream:
            good=0
            for line in stream:
                if not line.endswith(b'\n'):break
                row=json.loads(line);cached[row['path']]=row;decoded[row['sha256']]=row;good=stream.tell()
            stream.truncate(good)
    checkpoints=cache_path.open('a')

    def inspect(snapshot,name,archive_name):
        previous=cached.get(name)
        if previous and previous['sha256']==hash_file(snapshot):return previous
        row=inspect_cloud(snapshot,source=source,member=name,archive=archive_name,trees=trees,decoded_cache=decoded)
        checkpoints.write(json.dumps(row,separators=(',',':'))+'\n');checkpoints.flush()
        if retained:
            retained.mkdir(parents=True,exist_ok=True)
            # Retain bounded candidates per partition, label completeness and sensor.
            tree=trees.get((source,row['tree_id']))
            rank='complete' if tree and tree['reference_valid']['species'] else 'partial' if tree and tree['reference_valid']['genus'] else 'unknown'
            key=(row['published_split'],rank,row['modality'])
            candidate=(retained/('candidate-'+ '-'.join(key)+'.json'))
            if not candidate.exists() or row['size_bytes']<json.loads(candidate.read_text())['size_bytes']:
                old=json.loads(candidate.read_text()) if candidate.exists() else None
                dest=retained/(row['sha256']+'.laz');shutil.copyfile(snapshot,dest);write(candidate,row)
                if old and old['sha256']!=row['sha256']:(retained/(old['sha256']+'.laz')).unlink(missing_ok=True)
        return row

    def consume(info, stream):
        nonlocal last
        name=safe_path(info.name if hasattr(info,'name') else info.filename)
        if name in seen:
            raise ValueError('DUPLICATE_ARCHIVE_MEMBER')
        seen.add(name)
        size=info.size if hasattr(info,'size') else info.file_size
        entry=dict(path=name,size_bytes=size);members.append(entry)
        if name.lower().endswith('.zip'):
            if shutil.disk_usage(staging).free<size+4*1024**3:raise ValueError('INSUFFICIENT_AUDIT_STORAGE')
            snapshot=staging/'nested.zip'
            with snapshot.open('wb') as output:shutil.copyfileobj(stream,output,8*1024**2)
            if snapshot.stat().st_size!=size:raise ValueError('NESTED_ARCHIVE_TRUNCATED')
            entry['sha256']=hash_file(snapshot)
            nested.append(dict(path=name,local=snapshot))
            return
        if not name.lower().endswith(('.las','.laz')):
            digest=hashlib.sha256()
            for data in iter(lambda:stream.read(1024**2),b''):digest.update(data)
            entry['sha256']=digest.hexdigest()
            return
        snapshot=staging/'cloud'
        try:
            with snapshot.open('wb') as output:
                shutil.copyfileobj(stream,output,1024**2)
            if snapshot.stat().st_size!=size:
                raise ValueError('MEMBER_TRUNCATED')
            row=inspect(snapshot,name,asset['name']);observations.append(row);entry['sha256']=row['sha256']
            if len(observations)%100==0 or time.monotonic()-last>20:
                progress=dict(archive=asset['name'],observations=len(observations),points=sum(o['points'] for o in observations),elapsed_seconds=round(time.monotonic()-started,1))
                write(staging/'progress.json',progress);print(json.dumps(progress),flush=True);last=time.monotonic()
        finally:
            snapshot.unlink(missing_ok=True)
    try:
        if asset['name'].endswith('.zip'):
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    safe_path(member.filename)
                    if member.is_dir():continue
                    if member.flag_bits&1 or (member.external_attr>>16)&0o170000==0o120000:raise ValueError('UNSAFE_ZIP_MEMBER')
                    with archive.open(member) as stream:consume(member,stream)
        else:
            with path.open('rb') as raw, zstandard.ZstdDecompressor().stream_reader(raw) as stream:
                with tarfile.open(fileobj=stream,mode='r|') as archive:
                    for member in archive:
                        safe_path(member.name)
                        if member.isdir():continue
                        if not member.isfile() or member.pax_headers:raise ValueError('UNSUPPORTED_TAR_MEMBER')
                        consume(member,archive.extractfile(member))
                while stream.read(1024**2):pass
        aliases=[]
        by_identity={(o['tree_id'],o['modality']):o for o in observations}
        for item in nested:
            nested_seen=set()
            with zipfile.ZipFile(item['local']) as archive:
                for member in archive.infolist():
                    safe_path(member.filename)
                    if member.is_dir():continue
                    if member.filename in nested_seen:raise ValueError('DUPLICATE_NESTED_MEMBER')
                    nested_seen.add(member.filename)
                    if member.flag_bits&1 or (member.external_attr>>16)&0o170000==0o120000:raise ValueError('UNSAFE_ZIP_MEMBER')
                    with archive.open(member) as stream:
                        if not member.filename.lower().endswith(('.las','.laz')):
                            while stream.read(1024**2):pass
                            continue
                        snapshot=staging/'cloud'
                        try:
                            with snapshot.open('wb') as output:shutil.copyfileobj(stream,output,1024**2)
                            row=inspect_cloud(snapshot,source=source,member=member.filename,archive=asset['name'],trees=trees,decoded_cache=decoded)
                            original=by_identity.get((row['tree_id'],row['modality']))
                            if not original or row['native_records_sha256']!=original['native_records_sha256']:
                                raise ValueError('NESTED_CLOUD_NOT_AN_AUDITED_ALIAS: '+member.filename)
                            aliases.append(dict(container=item['path'],path=member.filename,sha256=row['sha256'],
                                native_records_sha256=row['native_records_sha256'],alias_of=original['observation_id']))
                        finally:snapshot.unlink(missing_ok=True)
            item['local'].unlink()
        after=path.stat()
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
            raise ValueError('ARCHIVE_CHANGED_DURING_AUDIT')
        return dict(archive=asset['name'],status='native-audited',sha256=hash_file(path),
            implementation_sha256=contract['implementation_sha256'],provider_checksum_verified=True,
            observations=observations,members=members,nested_aliases=aliases,
            elapsed_seconds=round(time.monotonic()-started,2),peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)
    finally:checkpoints.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True,choices=[FOR,BIODIV])
    parser.add_argument('--archive',type=Path,action='append',required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--staging',type=Path,required=True)
    args=parser.parse_args()
    from classification.model import load_registry
    registry,_,tree_rows=load_registry()
    trees={(t['source_ref'],t['tree_id']):t for t in tree_rows}
    source=next(s for s in registry['sources'] if s['source_ref']==args.source)
    expected={a['name']:a for a in source['assets'] if a['name'].endswith(('.zip','.tar.zst')) and a['name'] not in {'Graphs.tar.zst','QSM.tar.zst'}}
    supplied={a.name:a for a in args.archive}
    if set(expected)!=set(supplied) or len(supplied)!=len(args.archive):
        parser.error('Provide each original point archive exactly once; partial audit is not full-source evidence')
    args.staging.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.staging) as stage:
        reports=[audit_archive(supplied[name],args.source,asset,trees,Path(stage)) for name,asset in expected.items()]
    write(args.output,dict(schema_version='1.0.0',status='native-audited',source_ref=args.source,
          implementation_sha256=hash_file(__file__),archives=reports,
          limitations=['No automatic admission; compare cloud/label membership and complete browser acceptance before enabling']))


if __name__=='__main__':
    main()
