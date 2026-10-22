"""Reconcile complete local native reports without self-admitting either source."""
import argparse
import collections
import copy
import hashlib
import importlib.metadata
import json
import platform
from pathlib import Path

from classification.canonical import fingerprint
from classification.model import load_registry, validate_registry
from classification.snapshot import ROOT,FOR,BIODIV,write


def compact(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n')


def reconcile(registry,trees,reports):
    expected={a['name']:(s,a) for s in registry['sources'] for a in s['assets']
              if a['name'] in {'dev.zip','test.zip','TLS.tar.zst','ULS.tar.zst'}}
    if set(reports)!=set(expected):raise ValueError('COMPLETE_ARCHIVE_SET_REQUIRED')
    observations=[];archive_reports=[]
    for name,(source,asset) in expected.items():
        report=reports[name]
        if report['archive']!=name or report['status']!='native-audited' or not report['provider_checksum_verified']:
            raise ValueError('ARCHIVE_AUDIT_INCOMPLETE: '+name)
        if len({o['observation_id'] for o in report['observations']})!=len(report['observations']):
            raise ValueError('DUPLICATE_OBSERVATION')
        for o in report['observations']:
            if o['source_ref']!=source['source_ref'] or o['archive']!=name:raise ValueError('AUDIT_SOURCE_MISMATCH')
        by_id={o['observation_id']:o for o in report['observations']}
        for alias in report.get('nested_aliases',[]):
            if alias['alias_of'] not in by_id or alias['sha256']!=by_id[alias['alias_of']]['sha256']:
                raise ValueError('NESTED_ALIAS_NOT_BYTE_IDENTICAL')
        observations.extend(report['observations'])
        archive_reports.append(dict(source_ref=source['source_ref'],archive=name,size_bytes=asset['size_bytes'],sha256=report['sha256'],
            observations=len(report['observations']),points=sum(o['points'] for o in report['observations']),
            nested_byte_identical_aliases=len(report.get('nested_aliases',[])),
            implementation_sha256=report['implementation_sha256'],peak_rss_bytes=report.get('peak_rss_bytes'),
            elapsed_seconds=report.get('elapsed_seconds'),provider_checksum_verified=True))
    ids={(t['source_ref'],t['tree_id']):t for t in trees};views=collections.defaultdict(list)
    for o in observations:
        key=(o['source_ref'],o['tree_id'])
        if key not in ids:raise ValueError('NATIVE_CLOUD_WITHOUT_METADATA')
        tree=ids[key]
        if any(o[k]!=tree[k] for k in ['collection','published_split']):raise ValueError('NATIVE_MEMBERSHIP_CHANGED')
        views[key].append(o['modality'])
    for key,tree in ids.items():
        expected_modes=['TLS','ULS'] if key[0]==BIODIV else tree['modalities']
        if sorted(views.get(key,[]))!=sorted(expected_modes):raise ValueError('MISSING_OR_DUPLICATED_SENSOR_OBSERVATION: '+str(key))
    native_sources={}
    for ref in [FOR,BIODIV]:
        rows=[t for t in trees if t['source_ref']==ref];clouds=[o for o in observations if o['source_ref']==ref]
        by_hash=collections.defaultdict(list)
        for o in clouds:by_hash[o['sha256']].append(o)
        duplicates=[dict(sha256=digest,observations=[o['observation_id'] for o in group],
                         members=[dict(tree_id=o['tree_id'],published_split=o['published_split'],modality=o['modality']) for o in group],
                         published_splits=sorted({o['published_split'] for o in group}),
                         native_labels=sorted({ids[ref,o['tree_id']]['native_label'] or 'unknown' for o in group}))
                    for digest,group in sorted(by_hash.items()) if len(group)>1]
        native_sources[ref]=dict(trees=len(rows),observations=len(clouds),points=sum(o['points'] for o in clouds),
            modalities=dict(collections.Counter(o['modality'] for o in clouds)),
            las_point_formats=dict(collections.Counter(str(o['point_format']) for o in clouds)),
            byte_identical_cloud_groups=duplicates,
            duplicate_cloud_groups_crossing_partitions=sum(len(g['published_splits'])>1 for g in duplicates),
            partitions=dict(collections.Counter(t['published_split'] for t in rows)),
            genus_only=sum(t['reference_valid']['genus'] and not t['reference_valid']['species'] for t in rows),
            paired_tls_uls=sum(set(views[t['source_ref'],t['tree_id']])=={'TLS','ULS'} for t in rows),
            native_schema_signatures=sorted({fingerprint(dict(format=o['point_format'],fields=o['native_schema']['fields'])) for o in clouds}))
        if ref==BIODIV:
            native_sources[ref]['paired_native_tree_types']=dict(collections.Counter(t['native_metadata'].get('type','unknown') for t in rows
                if set(views[t['source_ref'],t['tree_id']])=={'TLS','ULS'}))
    return observations,dict(schema_version='1.0.0',status='native-validated',backend='local',
        scope='Every point cloud in all four complete pinned point archives; complete member and source checksum verification',
        archives=archive_reports,sources=native_sources,
        totals=dict(trees=len(trees),observations=len(observations),points=sum(o['points'] for o in observations)),
        limitations=['FOR nested train.zip members are byte-identical storage aliases, not extra tree observations',
                     'FOR published count differences are not filled with invented observations',
                     'Published partitions and overlapping plots do not establish geographic independence',
                     'Native validation does not admit a source or deploy a website'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reports',type=Path,default=ROOT/'temp/classification/native-audit')
    args=parser.parse_args();registry,vocabulary,trees=load_registry()
    names={'dev.zip':'dev','test.zip':'test','TLS.tar.zst':'TLS','ULS.tar.zst':'ULS'}
    reports={name:json.loads((args.reports/(stem+'.native.json')).read_text()) for name,stem in names.items()}
    observations,summary=reconcile(registry,trees,reports)
    directory=ROOT/'evidence/classification/native';directory.mkdir(parents=True,exist_ok=True)
    for name,report in reports.items():
        code_hash=report['implementation_sha256']
        candidates=[args.reports/(names[name].lower()+'-stage')/'implementation.py',
                    ROOT/'temp/classification/audit-code-snapshots'/(code_hash+'.py')]
        code=next((p.read_bytes() for p in candidates if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==code_hash),None)
        if code is None:raise ValueError('EXACT_NATIVE_IMPLEMENTATION_SNAPSHOT_REQUIRED: '+name)
        implementations=directory/'implementations';implementations.mkdir(exist_ok=True)
        (implementations/(code_hash+'.py')).write_bytes(code)
        prefetch=args.reports/(names[name].lower()+'-stage')/'prefetch-complete.json'
        if prefetch.exists():
            metrics=json.loads(prefetch.read_text())
            next(a for a in summary['archives'] if a['archive']==name)['prefetch_resources']=dict(
                parent_peak_rss_bytes=metrics['peak_rss_bytes'],worker_max_peak_rss_bytes=metrics['worker_peak_rss_bytes'],
                workers=metrics['workers'],scope='Per-process native prefetch peaks; not a simultaneous process-tree total')
        compact(directory/(names[name]+'.json'),report)
    summary['tools']=dict(python=platform.python_version(),**{name:importlib.metadata.version(name) for name in ['numpy','laspy','lazrs','zstandard']})
    write(ROOT/'evidence/classification/full-native-audit.json',summary)
    derived=copy.deepcopy(registry)
    for source in derived['sources']:
        ref=source['source_ref'];source['observations']=[o for o in observations if o['source_ref']==ref]
        source['native_audit']=dict(status='validated',backend='local',summary=summary['sources'][ref],
            path='evidence/classification/full-native-audit.json',sha256=hashlib.sha256((ROOT/'evidence/classification/full-native-audit.json').read_bytes()).hexdigest())
        source['blockers']=['Original-archive browser acceptance and maintainer admission pending']
        for asset in source['assets']:
            if asset['name'] in reports:asset['sha256']=reports[asset['name']]['sha256']
    validate_registry(derived,vocabulary,trees)
    compact(ROOT/'temp/classification/source-lock-native.json',derived)
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
