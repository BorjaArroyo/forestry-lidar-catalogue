"""Acquire only the four pinned classification point archives, with bounded RAM.

Resumable partial files and verified originals stay outside publication. This
local audit utility does not enable a source or alter its scientific admission.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
import urllib.error
import urllib.request

from filelock import FileLock

from classification.model import load_registry
from classification.snapshot import ROOT, write

ARCHIVES={'dev.zip','test.zip','TLS.tar.zst','ULS.tar.zst'}
RANGE_BYTES=256*1024**2


def emit(**fields):
    print(json.dumps(fields,sort_keys=True),flush=True)


def hashes(path):
    md5,sha=hashlib.md5(),hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024**2),b''):
            md5.update(chunk);sha.update(chunk)
    return md5,sha


def ranged_download(asset,directory,workers):
    """Reuse a contiguous prefix, fetch disjoint ranges, then verify one assembly."""
    part=directory/(asset['name']+'.part')
    ranges=directory/(asset['name']+'.ranges');ranges.mkdir(exist_ok=True)
    state=ranges/'state.json'
    if state.exists():
        plan=json.loads(state.read_text())
        if plan['asset']!=asset:
            raise ValueError('RANGE_SOURCE_CHANGED')
    else:
        if any(ranges.iterdir()):
            raise ValueError('UNRELATED_RANGE_STAGING')
        prefix=part.stat().st_size if part.exists() else 0
        segments=[]
        if prefix:segments.append(dict(start=0,size=prefix,path='prefix'))
        for start in range(prefix,asset['size_bytes'],RANGE_BYTES):
            segments.append(dict(start=start,size=min(RANGE_BYTES,asset['size_bytes']-start),path=str(start)))
        plan=dict(asset=asset,segments=segments);write(state,plan)
    segments=plan['segments']
    if segments and segments[0]['path']=='prefix' and not (ranges/'prefix').exists():
        if not part.exists() or part.stat().st_size!=segments[0]['size']:
            raise ValueError('RANGE_PREFIX_MISSING')
        part.rename(ranges/'prefix')

    def fetch_segment(segment):
        target=ranges/segment['path'];last=time.monotonic()
        for attempt in range(3):
            size=target.stat().st_size if target.exists() else 0
            if size>segment['size']:raise ValueError('RANGE_SIZE_MISMATCH')
            if size==segment['size']:return
            start=segment['start']+size;end=segment['start']+segment['size']-1
            request=urllib.request.Request(asset['url'],headers={
                'Range':f'bytes={start}-{end}','Accept-Encoding':'identity','User-Agent':'Canopy-classification-audit/1.0'})
            try:
                with urllib.request.urlopen(request,timeout=120) as response:
                    if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end}/{asset["size_bytes"]}':
                        raise ValueError('ARCHIVE_RANGE_MISMATCH')
                    with target.open('ab') as output:
                        while chunk:=response.read(8*1024**2):
                            if size+len(chunk)>segment['size']:raise ValueError('RANGE_SIZE_MISMATCH')
                            output.write(chunk);size+=len(chunk)
                            if time.monotonic()-last>=20:
                                total=sum((ranges/s['path']).stat().st_size if (ranges/s['path']).exists() else 0 for s in segments)
                                emit(phase='download-ranges',archive=asset['name'],bytes=total,total=asset['size_bytes']);last=time.monotonic()
                        output.flush();os.fsync(output.fileno())
                if size!=segment['size']:raise OSError('RANGE_TRUNCATED')
                return
            except (OSError,urllib.error.URLError) as error:
                emit(phase='range-retry',archive=asset['name'],start=start,attempt=attempt+1,error=str(error))
                if attempt==2:raise
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(fetch_segment,segments))
    emit(phase='assemble',archive=asset['name'])
    md5,sha=hashlib.md5(),hashlib.sha256()
    with part.open('wb') as output:
        for segment in segments:
            with (ranges/segment['path']).open('rb') as source:
                for chunk in iter(lambda:source.read(8*1024**2),b''):
                    output.write(chunk);md5.update(chunk);sha.update(chunk)
        output.flush();os.fsync(output.fileno())
    if part.stat().st_size!=asset['size_bytes'] or 'md5:'+md5.hexdigest()!=asset['checksum']:
        raise ValueError('ARCHIVE_CHECKSUM_MISMATCH: '+asset['name'])
    return md5,sha,ranges


def download(asset,directory,range_workers=1):
    directory.mkdir(parents=True,exist_ok=True)
    final=directory/asset['name'];part=final.with_name(final.name+'.part')
    identity={key:asset[key] for key in ['source_ref','name','size_bytes','checksum','url']}
    contract=final.with_name(final.name+'.input.json')
    with FileLock(str(final)+'.lock',timeout=0):
        if contract.exists() and json.loads(contract.read_text())!=identity:
            raise ValueError('ACQUISITION_SOURCE_CHANGED: '+asset['name'])
        if not contract.exists() and (final.exists() or part.exists()):
            raise ValueError('UNRELATED_EXISTING_INPUT: '+asset['name'])
        write(contract,identity)
        if final.exists():
            md5,sha=hashes(final)
            if final.stat().st_size!=asset['size_bytes'] or 'md5:'+md5.hexdigest()!=asset['checksum']:
                raise ValueError('EXISTING_ARCHIVE_CORRUPTED: '+asset['name'])
        elif range_workers>1 or (directory/(asset['name']+'.ranges/state.json')).exists():
            md5,sha,ranges=ranged_download(asset,directory,range_workers)
            part.rename(final);shutil.rmtree(ranges)
        else:
            for attempt in range(3):
                offset=part.stat().st_size if part.exists() else 0
                if offset>asset['size_bytes']:
                    raise ValueError('PARTIAL_ARCHIVE_TOO_LARGE')
                if offset==asset['size_bytes']:
                    break
                headers={'Accept-Encoding':'identity','User-Agent':'Canopy-classification-audit/1.0'}
                if offset:headers['Range']=f'bytes={offset}-'
                try:
                    request=urllib.request.Request(asset['url'],headers=headers)
                    with urllib.request.urlopen(request,timeout=120) as response:
                        if offset:
                            expected=f'bytes {offset}-{asset["size_bytes"]-1}/{asset["size_bytes"]}'
                            if response.status!=206 or response.headers.get('Content-Range')!=expected:
                                raise ValueError('RESUME_RANGE_MISMATCH: '+asset['name'])
                        elif response.status!=200:
                            raise ValueError('ARCHIVE_HTTP_'+str(response.status))
                        length=response.headers.get('Content-Length')
                        if length is not None and int(length)!=asset['size_bytes']-offset:
                            raise ValueError('ARCHIVE_LENGTH_MISMATCH')
                        last=time.monotonic()
                        with part.open('ab') as output:
                            while chunk:=response.read(8*1024**2):
                                if offset+len(chunk)>asset['size_bytes']:
                                    raise ValueError('ARCHIVE_SIZE_MISMATCH')
                                output.write(chunk);offset+=len(chunk)
                                if time.monotonic()-last>=20:
                                    emit(phase='download',archive=asset['name'],bytes=offset,total=asset['size_bytes']);last=time.monotonic()
                            output.flush();os.fsync(output.fileno())
                    if offset!=asset['size_bytes']:
                        raise OSError('ARCHIVE_TRUNCATED: '+asset['name'])
                    break
                except (OSError,urllib.error.URLError) as error:
                    emit(phase='retry',archive=asset['name'],attempt=attempt+1,error=str(error))
                    if attempt==2:raise
            if not part.exists() or part.stat().st_size!=asset['size_bytes']:
                raise ValueError('ARCHIVE_TRUNCATED')
            emit(phase='verify',archive=asset['name'],bytes=part.stat().st_size)
            md5,sha=hashes(part)
            if 'md5:'+md5.hexdigest()!=asset['checksum']:
                raise ValueError('ARCHIVE_CHECKSUM_MISMATCH: '+asset['name'])
            part.rename(final)
        report=dict(identity,status='verified',sha256=sha.hexdigest())
        write(final.with_name(final.name+'.verified.json'),report)
        emit(phase='verified',archive=asset['name'],size_bytes=asset['size_bytes'],sha256=report['sha256'])
        return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'temp/classification/originals')
    parser.add_argument('--workers',type=int,choices=[1,2,3,4],default=4)
    parser.add_argument('--range-workers',type=int,choices=[1,2,3,4],default=1)
    args=parser.parse_args();registry,_,_=load_registry()
    assets=sorted([dict(source_ref=s['source_ref'],**a) for s in registry['sources'] for a in s['assets'] if a['name'] in ARCHIVES],key=lambda a:a['size_bytes'])
    args.output.mkdir(parents=True,exist_ok=True)
    required=sum(a['size_bytes']-(args.output/(a['name']+'.part')).stat().st_size if (args.output/(a['name']+'.part')).exists() else
                 0 if (args.output/a['name']).exists() else a['size_bytes'] for a in assets)
    reserve=max(a['size_bytes'] for a in assets) if args.range_workers>1 else 0
    if shutil.disk_usage(args.output).free<required+reserve+10*1024**3:
        raise ValueError('INSUFFICIENT_STORAGE: originals plus 10 GiB reserve required')
    emit(phase='start',archives=len(assets),total_bytes=sum(a['size_bytes'] for a in assets))
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending=[pool.submit(download,asset,args.output,args.range_workers) for asset in assets]
        reports=[future.result() for future in concurrent.futures.as_completed(pending)]
    write(args.output/'acquisition.json',dict(status='verified',archives=reports))


if __name__=='__main__':main()
