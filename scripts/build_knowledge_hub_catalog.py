"""Build a portable knowledge-hub snapshot from pinned acquisition evidence."""
import argparse
import collections
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


TASKS = [
    ('instances', 'Tree instances', 'Individual-tree segmentation', 'Requires instance identity, annotation coverage, and boundary rules.'),
    ('components', 'Forest components', 'Wood, foliage & ground', 'Class meanings must match; tree labels alone do not identify wood or foliage.'),
    ('species', 'Tree species', 'Species classification', 'Requires documented species labels linked to tree identities.'),
    ('geometry', 'Geometry & robustness', 'Geometry and consistency checks', 'Unlabeled clouds can test consistency and distributions, not segmentation accuracy.'),
    ('spectral', 'Multispectral', 'Spectral learning', 'Wavelengths, channel units, normalization, and registration must be checked.'),
    ('biomass', 'Tree structure', 'Structure and biomass research', 'QSMs are derived models; independent reference measurements are required for accuracy claims.'),
]

# Curated source facts and proposals are separate from observed acquisition counts.
ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT/'knowledge-hub' if (ROOT/'knowledge-hub').is_dir() else ROOT
PROFILES = {int(k):v for k,v in json.loads((CONTENT/'dataset-profiles.json').read_text()).items()}
RELATIONSHIPS = json.loads((CONTENT/'relationships.json').read_text())


def build(inventory, status, outputs):
    scenes=[x for x in status['harmonized'] if x['status']=='verified']
    datasets=[]
    for record in inventory['records']:
        sid=record['record_id']; rows=[x for x in scenes if x['record_id']==sid]
        fields=collections.Counter(tuple(x['source_fields']) for x in rows)
        ds=dict(PROFILES[sid], id=str(sid), title=record['title'], url=record['url'], doi=record.get('doi'), version=record.get('version') or 'Pinned record', license=record.get('license_declared',{}).get('id','unknown'), cloud_count=len(rows), points=sum(x['point_count'] for x in rows), chunks=sum(len(x['chunks']) for x in rows), assets=len(record['files']), source_fields=sorted({f for x in rows for f in x['source_fields']}), schemas=[{'fields':list(k),'files':v} for k,v in fields.items()], example_paths=[x['input'] for x in rows[:3]])
        crs=collections.Counter(x.get('source_crs') or 'Unknown / not recorded' for x in rows)
        ds['source_metadata_sha256']=record.get('metadata_sha256')
        ds['coordinate_references']=[{'value':k if k!='None' else 'Unknown / not recorded','files':v} for k,v in crs.items()]
        ds['coordinate_policy']='Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.'
        ds['deferred_clouds']=3 if sid==15193973 else 0
        datasets.append(ds)
    groups=collections.defaultdict(list)
    for s in scenes:groups[tuple(c['sha256'] for c in s['chunks'])].append(s)
    identical=[g for g in groups.values() if len(g)>1]
    source_groups=collections.defaultdict(list)
    for x in outputs:source_groups[(x['sha256'],x['size_bytes'])].append(x)
    byte_groups=[g for g in source_groups.values() if len(g)>1]
    point_groups=[g for g in byte_groups if any(Path(x['path']).suffix=='.ply' for x in g)]
    catalog={'schema_version':'0.1','generated_at':datetime.now(timezone.utc).isoformat(),'title':'Canopy / LiDAR Knowledge Hub','scope':'Acquired sources; compatibility is task-specific and does not authorize training or redistribution.','summary':{'datasets':len(datasets),'assets':len(status['completed']),'clouds':len(scenes),'points':sum(x['point_count'] for x in scenes),'chunks':sum(len(x['chunks']) for x in scenes),'deferred':3,'acquisition_errors':len(status['errors']),'conversion_errors':len(status['conversion_errors']),'duplicate_source_groups':len(byte_groups),'duplicate_cloud_copies':sum(len(g)-1 for g in point_groups),'identical_scene_groups':len(identical),'identical_scene_extras':sum(len(g)-1 for g in identical)},'tasks':[{'id':a,'name':b,'title':c,'description':d} for a,b,c,d in TASKS],'datasets':datasets}
    catalog['mappings'] = json.loads(json.dumps(RELATIONSHIPS))
    for dataset in datasets:
        review = dataset['review']
        current = {k:dataset[k] for k in ('source_metadata_sha256','cloud_count','points','schemas')}
        review['observations_current'] = current == review['observations_snapshot']
    normalized_extras = sum(len(g)-1 for g in identical)
    split_copies = sum(len(g)-1 for g in point_groups if all(x['record_id']==16875688 for x in g)
                       and any('/train/' in x['path'] for x in g) and any('/val/' in x['path'] for x in g))
    pending_sites = sum(x.get('physical_site') in (None,'pending_review') or x.get('split') in (None,'unassigned') for x in scenes)
    lautx_count = sum(x['record_id']==16910335 for x in scenes)
    unmapped_semantics = sum(x['record_id'] in {8287792,17172162} for x in scenes)
    total_points = sum(x['point_count'] for x in scenes)
    treescan_pct = round(100 * sum(x['point_count'] for x in scenes if x['record_id']==19127709) / total_points) if total_points else 0
    catalog['findings']=[
      {'id':'duplicates','severity':'high','title':f'{normalized_extras:,} duplicate normalized exports','count':normalized_extras,'description':'Complete recorded chunk-hash sequences identify these extra exports. These are saved hash records, not a current payload reread or a deletion decision.','datasets':['16875688','7307956'],'state':'Confirmed metadata evidence'},
      {'id':'split-leakage','severity':'high','title':f'{split_copies:,} exact copies span train / validation','count':split_copies,'description':'The source manifests identify byte-identical TLS tree exports in both folders. Official plot splits and extracted-tree evaluation have different units.','datasets':['16875688'],'state':'Source-hash evidence'},
      {'id':'lautx','severity':'high','title':f'{lautx_count:,} files need an instance crosswalk','count':lautx_count,'description':'StemID and treeIDv1/v2 survive in original_points but are not read by the existing harmonizer. Manual/automatic pairs must remain separate annotation variants.','datasets':['16910335'],'state':'Schema audit + sampled payloads'},
      {'id':'semantics','severity':'medium','title':'Available source labels are not all mapped','count':unmapped_semantics,'description':'FOR v1 classification is unmapped; ForestSemantic-MS preserves low vegetation and woody debris without a coarse semantic assignment. This requires task-specific mapping decisions.','datasets':['8287792','17172162'],'state':'Schema audit + source definitions'},
      {'id':'lineage','severity':'high','title':'No certified site-out split yet','count':pending_sites,'description':'Records counted here lack reviewed site or split metadata. Cross-dataset identities and annotation descendants must be grouped before evaluation.','datasets':[str(x['record_id']) for x in inventory['records']],'state':'Full metadata audit'},
      {'id':'rights','severity':'medium','title':'Three derivatives deliberately deferred','count':3,'description':'ForestSemantic source files are acquired; their conversions await derivative-rights review. Other record-declared licenses still require component and intended-use checks.','datasets':['15193973'],'state':'Acquisition policy'},
      {'id':'balance','severity':'medium','title':'Point count is strongly imbalanced','count':treescan_pct,'description':f'TreeScanPL10K accounts for approximately {treescan_pct}% of stored normalized points before deduplication. File counts do not measure independent sites or balanced training exposure.','datasets':['19127709'],'state':'Full metadata audit'},
    ]
    catalog['duplicates']=[{'kind':'Identical normalized data','records':[str(x['record_id']) for x in g],'paths':[x['input'] for x in g],'points':g[0]['point_count']} for g in identical]
    catalog['duplicate_examples']=[{'kind':'Identical normalized data','records':[str(x['record_id']) for x in g],'paths':[x['input'] for x in g],'points':g[0]['point_count']} for g in identical[:8]]
    catalog['content_review']={'reviewed_at':'2026-10-17','scope':'Source documentation, saved metadata and existing code; no new scientific admission','profiles_sha256':hashlib.sha256((CONTENT/'dataset-profiles.json').read_bytes()).hexdigest(),'relationships_sha256':hashlib.sha256((CONTENT/'relationships.json').read_bytes()).hexdigest()}
    catalog['evidence']=[{'name':'Public content review and remaining questions','url':'CONTENT-REVIEW.md'},{'name':'Pinned inventory','path':'docs/lidar-acquisition-inventory.json'},{'name':'Acquisition and recovery log','path':'docs/lidar-acquisition-log.md'},{'name':'Annotation definitions','path':'docs/annotations.md'},{'name':'Training and generalization protocol','path':'docs/lidar-training-data-plan.md'},{'name':'Prior provenance audit','path':'docs/data-provenance-audit.md'}]
    catalog['audit_scope']={'metadata':f"All {len(status['completed']):,} asset manifests, {len(outputs):,} stored-file records, {len(scenes):,} normalized cloud records and {sum(len(x['chunks']) for x in scenes):,} chunk records.",'payload_samples':'Historical 2026-10-15 payload sample: 40 chunks / 17,102,064 points across 20 then-observed source field schemas; not rerun by this builder.','limits':'No current full-payload reread, order-invariant geometry audit, scanner calibration validation, or final license admission. Duplicate groups are evidence for review, not deletion instructions.','curation_applied':False}
    return catalog


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inventory',type=Path,default=Path('docs/lidar-acquisition-inventory.json'))
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();inventory=json.loads(args.inventory.read_text())
    status=json.loads((args.root/'acquisition-status.json').read_text());outputs=[]
    for r in inventory['records']:
        for a in r['files']:
            m=json.loads((args.root/'sources'/str(r['record_id'])/'manifests'/(a['name']+'.json')).read_text());outputs.extend(dict(x,record_id=r['record_id'],asset=a['name']) for x in m['outputs'])
    catalog=build(inventory,status,outputs)
    catalog['snapshot_provenance']={'inventory_sha256':hashlib.sha256(args.inventory.read_bytes()).hexdigest(),'acquisition_status_sha256':hashlib.sha256((args.root/'acquisition-status.json').read_bytes()).hexdigest(),'builder':'scripts/build_knowledge_hub_catalog.py','sample_audit_date':'2026-10-15'}
    assert len({x['id'] for x in catalog['datasets']})==len(catalog['datasets'])
    ids={x['id'] for x in catalog['datasets']}
    assert all(m['source'] in ids and m['target'] in ids for m in catalog['mappings'])
    args.output.mkdir(parents=True,exist_ok=True)
    text=json.dumps(catalog,indent=2,ensure_ascii=False)+'\n'
    (args.output/'catalog.json').write_text(text)
    (args.output/'catalog.js').write_text('window.LIDAR_CATALOG = '+text.rstrip()+';\n')
    print('CATALOG_VALIDATED',len(catalog['datasets']),'datasets',len(catalog['mappings']),'mappings')


if __name__=='__main__':main()
