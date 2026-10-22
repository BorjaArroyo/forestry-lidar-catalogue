"""Bounded local parallel TLS reference generation; final audit verifies inputs."""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import resource
import tarfile
import time

import zstandard

from classification.audit import hash_file
from classification.model import load_registry, safe_path
from classification.prefetch_dev import PendingRanges,decode_snapshot
from classification.snapshot import ROOT,BIODIV,write


def main():
    base=ROOT/'temp/classification';stage=base/'native-audit/tls-stage';stage.mkdir(parents=True,exist_ok=True)
    registry,_,_=load_registry();source=next(s for s in registry['sources'] if s['source_ref']==BIODIV)
    asset=next(a for a in source['assets'] if a['name']=='TLS.tar.zst')
    import classification.audit as audit
    code=Path(audit.__file__).read_bytes();contract=dict(source_ref=BIODIV,asset=asset,implementation_sha256=hashlib.sha256(code).hexdigest())
    contract_path=stage/'audit-input.json'
    if contract_path.exists() and json.loads(contract_path.read_text())!=contract:raise ValueError('AUDIT_CHECKPOINT_CHANGED')
    write(contract_path,contract);(stage/'implementation.py').write_bytes(code)
    cache=stage/'observations.jsonl';cached={}
    if cache.exists():
        with cache.open('rb+') as stream:
            good=0
            for line in stream:
                if not line.endswith(b'\n'):break
                row=json.loads(line);cached[row['path']]=row;good=stream.tell()
            stream.truncate(good)
    ranges=PendingRanges(base/'originals',asset['name'])
    class Sequential:
        def __init__(self):self.offset=0
        def read(self,size):
            size=min(size,asset['size_bytes']-self.offset)
            if size<=0:return b''
            result=ranges.read(self.offset,size);self.offset+=len(result);return result
    started=time.monotonic();completed=len(cached);points=sum(o['points'] for o in cached.values());pending=[]
    with cache.open('a') as checkpoints,concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        def collect(block=False):
            nonlocal completed,points,pending
            if not pending:return
            ready,_=concurrent.futures.wait(pending,return_when=concurrent.futures.FIRST_COMPLETED,timeout=None if block else 0)
            for future in ready:
                row=future.result();checkpoints.write(json.dumps(row,separators=(',',':'))+'\n');checkpoints.flush()
                points+=row['points'];completed+=1;pending.remove(future)
                if completed%100==0:
                    progress=dict(status='provisional-until-whole-archive-verification',observations=completed,points=points,
                        workers=4,elapsed_seconds=round(time.monotonic()-started,1))
                    write(stage/'prefetch-progress.json',progress);print(json.dumps(progress),flush=True)
        with zstandard.ZstdDecompressor().stream_reader(Sequential()) as decoded:
            with tarfile.open(fileobj=decoded,mode='r|') as archive:
                for index,member in enumerate(archive):
                    safe_path(member.name)
                    if member.isdir():continue
                    if not member.isfile() or member.pax_headers:raise ValueError('UNSUPPORTED_TAR_MEMBER')
                    if not member.name.lower().endswith(('.las','.laz')) or member.name in cached:continue
                    snapshot=stage/('prefetch-cloud-'+str(index))
                    try:
                        with snapshot.open('wb') as output:
                            stream=archive.extractfile(member)
                            while data:=stream.read(1024**2):output.write(data)
                        if snapshot.stat().st_size!=member.size:raise ValueError('TAR_MEMBER_TRUNCATED')
                        pending.append(pool.submit(decode_snapshot,snapshot,member.name,BIODIV,asset['name']))
                        collect(len(pending)>=8)
                    except BaseException:snapshot.unlink(missing_ok=True);raise
            while decoded.read(1024**2):pass
        while pending:collect(True)
    write(stage/'prefetch-complete.json',dict(status='provisional',observations=completed,points=points,
        implementation_sha256=contract['implementation_sha256'],peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
        worker_peak_rss_bytes=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss*1024,workers=4))


if __name__=='__main__':main()
