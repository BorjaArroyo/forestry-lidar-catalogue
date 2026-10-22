"""Synthetic fixtures for isolated acceptance, never source-admission evidence."""
import copy
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tarfile
import zipfile

import laspy
import numpy as np
import zstandard

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from classification.model import load_registry
from classification.snapshot import FOR,BIODIV,write
from classification.audit import inspect_cloud
from classification.canonical import fingerprint


def build(destination):
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    r,v,_=load_registry();r=copy.deepcopy(r);trees=[];observations=[];clouds=[]
    rows=[(FOR,'1','dev','Picea_abies',['TLS']), (FOR,'2','dev','Picea_abies',['MLS']),
          (FOR,'3','dev','Picea_abies',['ULS']), (FOR,'4','test',None,['unknown']),
          (BIODIV,'B1','train','Picea_abies',['TLS','ULS']), (BIODIV,'B2','train','Quercus_spec',['TLS','ULS']),
          (BIODIV,'B3','validate','Picea_abies',['TLS','ULS']), (BIODIV,'B4','test','Picea_abies',['TLS','ULS']),
          (BIODIV,'B5','unassigned','Picea_abies',['TLS','ULS'])]
    for index,(ref,identity,split,label,modes) in enumerate(rows):
        mapping=next((m for m in v['mappings'] if m['source_ref']==ref and m['native_label']==label),None)
        tree=dict(source_ref=ref,tree_id=identity,native_label=label,
            taxonomy={rank:mapping[rank] if mapping else None for rank in v['ranks']},
            reference_valid={rank:bool(mapping and mapping[rank]) for rank in v['ranks']},
            collection='synthetic-shared-plot',published_split=split,modalities=modes if ref==FOR else [],
            native_metadata={'fixture':'synthetic; not native source evidence','dbh':'42.1'})
        trees.append(tree)
        for mode in modes:
            header=laspy.LasHeader(point_format=6,version='1.4')
            header.scales=[.001,.002,.003];header.offsets=[450000.,5000000.,-10.]
            header.add_extra_dim(laspy.ExtraBytesParams(name='native_trait',type='f4'))
            cloud=laspy.LasData(header)
            n=273+index;cloud.X=np.arange(n,dtype=np.int32)-100;cloud.Y=np.arange(n,dtype=np.int32)+200;cloud.Z=np.arange(n,dtype=np.int32)-70
            cloud.classification=np.arange(n,dtype=np.uint8)%8;cloud.intensity=np.arange(n,dtype=np.uint16)*17
            cloud.gps_time=np.arange(n)*.125;cloud.native_trait=np.arange(n,dtype=np.float32)*.5
            member=identity+'.laz' if ref==FOR else mode+'/'+identity+'_'+mode+'.laz'
            path=destination/(identity+'-'+mode+'.laz');cloud.write(path)
            archive=('dev.zip' if split=='dev' else 'test.zip') if ref==FOR else mode+'.tar.zst'
            observed=inspect_cloud(path,source=ref,member=member,archive=archive,trees={(ref,identity):tree})
            observations.append(observed);clouds.append((archive,member,path,ref))
    return package(destination,r,v,trees,observations,clouds,'synthetic-isolated-test')


def package(destination,r,v,trees,observations,clouds,scope):
    observations=json.loads(json.dumps(observations))
    for source in r['sources']:
        source.update(status='validated',execution_enabled=True,blockers=[],
            native_audit={'status':'validated','scope':scope},browser_acceptance={'status':'validated','scope':scope},
            observations=[o for o in observations if o['source_ref']==source['source_ref']])
        assets=[]
        for name in sorted({a for a,_,_,ref in clouds if ref==source['source_ref']}):
            path=destination/name
            if name.endswith('.zip'):
                with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
                    for current,member,p,ref in clouds:
                        if current==name and ref==source['source_ref']:archive.write(p,member)
            else:
                raw=io.BytesIO()
                with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as archive:
                    for current,member,p,ref in clouds:
                        if current==name and ref==source['source_ref']:
                            info=tarfile.TarInfo(member);info.size=p.stat().st_size;archive.addfile(info,io.BytesIO(p.read_bytes()))
                path.write_bytes(zstandard.ZstdCompressor(write_checksum=True).compress(raw.getvalue()))
            assets.append(dict(name=name,size_bytes=path.stat().st_size,checksum='md5:'+hashlib.md5(path.read_bytes()).hexdigest(),
                url='/'+str(path.relative_to(ROOT))))
        source['assets']=assets
    tree_doc={'schema_version':'1.0.0','trees':trees};write(destination/'trees.json',tree_doc)
    r['trees']['sha256']=hashlib.sha256((destination/'trees.json').read_bytes()).hexdigest()
    write(destination/'source-lock.json',r)
    lock=json.loads((ROOT/'browser-prepare/classification-runtime-lock.json').read_text())
    for name in ['source-lock.json','trees.json']:
        path=destination/name
        lock['files']['scripts/classification/'+name]=dict(path=str(path.relative_to(ROOT)),
            size_bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    write(destination/'runtime-lock.json',lock)
    return dict(registry=r,vocabulary=v,trees=trees,observations=observations)


def build_real(destination):
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    r,v,trees=load_registry();r=copy.deepcopy(r)
    samples=json.loads((ROOT/'evidence/classification/acceptance-manifest.json').read_text())['native_samples']
    identities={(o['source_ref'],o['tree_id']) for o in samples}
    trees=[t for t in trees if (t['source_ref'],t['tree_id']) in identities]
    clouds=[]
    for o in samples:
        name=o['published_split']+'-'+o['path'] if o['source_ref']==FOR else o['modality']+'-'+Path(o['path']).name
        path=ROOT/'temp/classification'/name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=o['sha256']:
            raise ValueError('Missing exact bounded native sample: '+name)
        clouds.append((o['archive'],o['path'],path,o['source_ref']))
    return package(destination,r,v,trees,samples,clouds,'bounded-repackaged-real-samples; not original archive audit')


def build_full(destination):
    """Use exact full provider archives and the frozen native acceptance selection."""
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    registry,vocabulary,all_trees=load_registry()
    native=json.loads((ROOT/'temp/classification/source-lock-native.json').read_text())
    manifest=json.loads((ROOT/'evidence/classification/full-acceptance-manifest.json').read_text())
    samples=manifest['samples'];trees=all_trees
    for source in native['sources']:
        source.update(status='validated',execution_enabled=True,blockers=[],
            browser_acceptance={'status':'validated','scope':'isolated original-archive acceptance, not publication admission'})
        for asset in source['assets']:
            if asset['name'] in {'dev.zip','test.zip','TLS.tar.zst','ULS.tar.zst'}:
                path=ROOT/'temp/classification/originals'/asset['name']
                if not path.is_file() or path.stat().st_size!=asset['size_bytes']:raise ValueError('FULL_ORIGINAL_ARCHIVE_REQUIRED')
    write(destination/'trees.json',{'schema_version':'1.0.0','trees':trees})
    native['trees']['sha256']=hashlib.sha256((destination/'trees.json').read_bytes()).hexdigest()
    write(destination/'source-lock.json',native)
    lock=json.loads((ROOT/'browser-prepare/classification-runtime-lock.json').read_text())
    for name in ['source-lock.json','trees.json']:
        path=destination/name;lock['files']['scripts/classification/'+name]=dict(path=str(path.relative_to(ROOT)),
            size_bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    write(destination/'runtime-lock.json',lock)
    return dict(registry=native,vocabulary=vocabulary,trees=trees,observations=samples)


def build_paired(destination):
    """Repackage exact native clouds exported by full-original acceptance."""
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    registry,vocabulary,all_trees=load_registry();registry=copy.deepcopy(registry)
    samples=json.loads((ROOT/'evidence/classification/full-acceptance-manifest.json').read_text())['samples']
    identities={(o['source_ref'],o['tree_id']) for o in samples}
    trees=[t for t in all_trees if (t['source_ref'],t['tree_id']) in identities]
    original=ROOT/'temp/classification/chromium-full-inference'
    exported=json.loads((original/'dataset.json').read_text())['observations']
    by_id={(o['source_ref'],o['observation_id']):o for o in exported}
    clouds=[]
    for o in samples:
        row=by_id[o['source_ref'],o['observation_id']]
        path=original/row['original_path']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=o['sha256']:raise ValueError('PAIRED_NATIVE_SAMPLE_CHANGED')
        clouds.append((o['archive'],o['path'],path,o['source_ref']))
    return package(destination,registry,vocabulary,trees,samples,clouds,'bounded-repackaged-real-paired-samples')


if __name__=='__main__':
    build(ROOT/'temp/classification/fixtures')
