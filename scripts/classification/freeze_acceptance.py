"""Freeze a bounded real paired-view selection from complete native references.

This freezes the final original-archive acceptance before that acceptance runs.
It does not claim the samples preceded the earlier adapter prototypes.
"""
import collections
import hashlib
import json

from classification.snapshot import ROOT,FOR,BIODIV,write


def freeze(registry,trees):
    rows={(t['source_ref'],t['tree_id']):t for t in trees}
    observations=[o for s in registry['sources'] for o in s['observations']]
    selected=[]
    for mode in ['TLS','MLS','ULS']:
        candidates=[o for o in observations if o['source_ref']==FOR and o['modality']==mode and o['published_split']=='dev']
        # At least one genuine native cloud crosses the storage block boundary.
        if mode=='TLS':candidates=[o for o in candidates if o['points']>250000]
        selected.append(min(candidates,key=lambda o:(o['size_bytes'],o['tree_id'])))
    selected.append(min((o for o in observations if o['source_ref']==FOR and o['published_split']=='test' and o['point_format']==6),
                        key=lambda o:(o['size_bytes'],o['tree_id'])))
    pairs=collections.defaultdict(list)
    for o in observations:
        if o['source_ref']==BIODIV:pairs[o['tree_id']].append(o)
    categories=[('train',True),('train',False),('validate',True),('test',True),('unassigned',True)]
    for split,complete in categories:
        candidates=[]
        for identity,views in pairs.items():
            tree=rows[BIODIV,identity]
            if tree['published_split']!=split or tree['reference_valid']['species'] is not complete:continue
            if not tree['reference_valid']['genus'] or sorted(o['modality'] for o in views)!=['TLS','ULS']:continue
            candidates.append(views)
        selected.extend(min(candidates,key=lambda views:(sum(o['size_bytes'] for o in views),views[0]['tree_id'])))
    selected.sort(key=lambda o:(o['source_ref'],o['observation_id']))
    identities={(o['source_ref'],o['tree_id']) for o in selected}
    return dict(schema_version='1.0.0',status='frozen-before-original-archive-acceptance',
        date='2026-10-21',samples=selected,
        totals=dict(trees=len(identities),observations=len(selected),points=sum(o['points'] for o in selected),
                    native_cloud_bytes=sum(o['size_bytes'] for o in selected),
                    blocks=sum(len(o['chunks']) for o in selected)),
        coverage=dict(for_modalities=['TLS','MLS','ULS','unknown-test'],native_point_formats=[0,3,6],biodiv_paired_trees=5,
                      biodiv_splits=['train','validate','test','unassigned'],partial_genus_reference=True,
                      uses=['training','validation','evaluation','inference']),
        resource_policy=dict(block_points=250000,zstd_window_limit_bytes=64*1024**2,
                             browser_worker_estimate='2 * largest selected compressed cloud + 2 * largest record/XYZ block + 128 MiB',
                             process_memory='Sample Linux process-tree RSS and PSS every 0.5 seconds; report observations, not allocation limits'),
        limitations=['Final real selection was frozen after adapter prototyping; the original pre-adapter freeze requirement was not met',
                     'Full original archive traversal selects bounded clouds; complete native auditing covers all clouds',
                     'No source admission or deployment is implied'])


def main():
    registry=json.loads((ROOT/'temp/classification/source-lock-native.json').read_text())
    trees=json.loads((ROOT/'scripts/classification/trees.json').read_text())['trees']
    result=freeze(registry,trees)
    path=ROOT/'evidence/classification/full-native-audit.json'
    result['full_native_audit']=dict(path=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    write(ROOT/'evidence/classification/full-acceptance-manifest.json',result)
    print(json.dumps(result['totals'],indent=2))


if __name__=='__main__':main()
