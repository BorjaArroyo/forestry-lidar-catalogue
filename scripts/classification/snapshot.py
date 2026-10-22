"""Reproduce the pinned label audit without downloading point-cloud archives.

The original provider bytes are kept in sources/. This is metadata evidence,
never full-source admission. Full payload auditing is a separate operation.
"""
import collections
import csv
import hashlib
import io
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FOR = 'zenodo:13255198'
BIODIV = 'grodata:128035:1.0'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def rows(name, expected_md5):
    data = (HERE / 'sources' / name).read_bytes()
    if hashlib.md5(data).hexdigest() != expected_md5:
        raise ValueError('SOURCE_TABLE_CHANGED: ' + name)
    result = list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))
    ids = [row['treeID'] for row in result]
    if len(ids) != len(set(ids)):
        raise ValueError('DUPLICATE_TREE_ID: ' + name)
    return result


def build():
    for_meta = json.loads((HERE / 'sources/for-record.json').read_text())
    bio_meta = json.loads((HERE / 'sources/biodiv-record.json').read_text())['data']
    if for_meta['id'] != 13255198 or (bio_meta['datasetId'], bio_meta['versionNumber'], bio_meta['versionMinorNumber']) != (128035, 1, 0):
        raise ValueError('SOURCE_VERSION_CHANGED')
    for_rows = rows('for-labels.csv', '603c91ff58c8eab486717ffc82a1b21f')
    bio_rows = rows('biodiv-labels.csv', 'a09d1dfb60145313a950354124dcd925')
    assets_for = [dict(name=f['key'], size_bytes=f['size'], checksum=f['checksum'],
                       url=f['links']['self']) for f in for_meta['files']]
    assets_bio = [dict(name=f['dataFile']['filename'], size_bytes=f['dataFile']['filesize'],
                       checksum='md5:' + f['dataFile']['md5'], file_id=f['dataFile']['id'],
                       url='https://data.goettingen-research-online.de/api/access/datafile/' + str(f['dataFile']['id']))
                  for f in bio_meta['files']]
    originals = {p.name: dict(path=str(p.relative_to(ROOT)), size_bytes=p.stat().st_size, sha256=sha(p.read_bytes()))
                 for p in sorted((HERE / 'sources').iterdir()) if p.is_file()}
    # Explicit exact-label crosswalk. No spelling repair or synonym resolution.
    labels = {}
    for source, data in [(FOR, for_rows), (BIODIV, bio_rows)]:
        for row in data:
            label = row['species']
            genus, epithet = label.split('_')
            if source == FOR and genus != row['genus']:
                raise ValueError('CONFLICTING_GENUS: ' + label)
            labels[(source, label)] = (genus, None if epithet == 'spec' else label)
    taxa = {}
    for genus, species in labels.values():
        taxa['taxon:genus:' + genus] = dict(rank='genus', name=genus, parent_id=None)
        if species:
            taxa['taxon:species:' + species] = dict(rank='species', name=species, parent_id='taxon:genus:' + genus)
    vocabulary = dict(schema_version='1.0.0', vocabulary_id='canopy:tree-taxonomy:1.0.0',
        ranks=['genus', 'species'], unknown_code=-1,
        scope='Exact documented labels and binomial genus tokens; no synonym resolution or inferred higher ranks',
        taxa=[dict(id=key, code=i, **taxa[key]) for i, key in enumerate(sorted(taxa))],
        mappings=[dict(source_ref=source, native_label=label,
                       genus='taxon:genus:' + genus, species='taxon:species:' + species if species else None,
                       evidence=originals['for-labels.csv' if source == FOR else 'biodiv-labels.csv']['sha256'])
                  for (source, label), (genus, species) in sorted(labels.items())])
    vocabulary_path = HERE / 'vocabulary.json'
    write(vocabulary_path, vocabulary)
    known = {(m['source_ref'], m['native_label']): m for m in vocabulary['mappings']}
    trees = []
    for source, data in [(FOR, for_rows), (BIODIV, bio_rows)]:
        for row in data:
            mapping = known[source, row['species']]
            trees.append(dict(source_ref=source, tree_id=row['treeID'], native_label=row['species'],
                              taxonomy={rank: mapping[rank] for rank in vocabulary['ranks']},
                              reference_valid={rank: mapping[rank] is not None for rank in vocabulary['ranks']},
                              collection=row['dataset'] if source == FOR else row['ep'],
                              published_split='dev' if source == FOR else row['split'] or 'unassigned',
                              modalities=[row['data_type']] if source == FOR else [],
                              native_metadata=row))
    inventory_path=ROOT/'evidence/classification/for-member-inventory.json'
    if inventory_path.exists():
        inventory=json.loads(inventory_path.read_text())
        for member in inventory['members']:
            if member['published_split']=='test':
                trees.append(dict(source_ref=FOR,tree_id=member['tree_id'],native_label=None,
                    taxonomy={'genus':None,'species':None},reference_valid={'genus':False,'species':False},
                    collection='unknown',published_split='test',modalities=['unknown'],native_metadata={}))
    (HERE / 'trees.json').write_text(json.dumps(dict(schema_version='1.0.0', trees=trees), separators=(',', ':'), ensure_ascii=False) + '\n')
    plots = collections.defaultdict(set)
    for row in bio_rows:
        if row['split']:
            plots[row['ep']].add(row['split'])
    report = dict(schema_version='1.0.0', status='metadata-audited', audit_date='2026-10-21',
        scope='Complete original label tables and provider metadata; point archives not audited',
        originals=originals,
        sources={FOR: dict(label_rows=len(for_rows), species_labels=len({r['species'] for r in for_rows}),
                          modalities=dict(collections.Counter(r['data_type'] for r in for_rows)),
                          csv_filename_join='Unverified: CSV /train/*.las differs from documented dev/*.laz; requires member inventory',
                          test_reference='No public test labels; inference only'),
                 BIODIV: dict(label_rows=len(bio_rows), genus_only=sum(r['species'].endswith('_spec') for r in bio_rows),
                              published_partitions=dict(collections.Counter(r['split'] or 'unassigned' for r in bio_rows)),
                              plots=len(plots), shared_partition_plots={k:sorted(v) for k,v in sorted(plots.items()) if len(v)>1},
                              uls_coverage='Unverified: labels and README are not a cloud inventory')},
        spatial_audit=dict(status='observed-plot-overlap', independence='not-demonstrated',
                           explanation='All listed shared plots occur in multiple official partitions; no new spatial split is created'))
    if inventory_path.exists():
        report['sources'][FOR].update(csv_filename_join='Exact decimal treeID/member basename join: all 17,707 dev rows matched; original filename retained',
                                     test_members=sum(m['published_split']=='test' for m in inventory['members']),
                                     inventory_sha256=sha(inventory_path.read_bytes()),
                                     extra_members=[i for i in inventory['issues'] if i.get('issue')=='non-cloud-member'])
    write(ROOT / 'evidence/classification/metadata-audit.json', report)
    registry = dict(schema_version='1.0.0', task_ref='task:species',
        vocabulary=dict(path='scripts/classification/vocabulary.json', sha256=sha(vocabulary_path.read_bytes())),
        trees=dict(path='scripts/classification/trees.json', sha256=sha((HERE / 'trees.json').read_bytes())),
        sources=[dict(source_ref=source, name=name, provider=provider, version=version, url=url,
                      status='wip', execution_enabled=False, modalities=modes,
                      modality_policy='single-view' if source==FOR else 'paired-views',
                      license=license, assets=assets, label_table=originals[table],
                      observations=[], audit_ref='evidence/classification/metadata-audit.json',
                      blockers=['Complete native archive audit deferred', 'Native-equivalence and browser acceptance pending'],
                      input_policy='Preserve all points, native precision, attributes and published partitions',
                      coordinate_policy='Native sensor views; shared coordinates and geographic independence not established')
                 for source,name,provider,version,url,modes,license,assets,table in [
                     (FOR,'FOR-species20K','zenodo','v1','https://zenodo.org/records/13255198',['TLS','MLS','ULS','unknown'],
                      for_meta['metadata']['license']['id'],assets_for,'for-labels.csv'),
                     (BIODIV,'BioDiv-3DTrees','grodata','1.0','https://doi.org/10.25625/8PB1IF',['TLS','ULS'],
                      bio_meta['license']['name'],assets_bio,'biodiv-labels.csv')]])
    samples_path=ROOT/'evidence/classification/acceptance-manifest.json'
    if samples_path.exists():
        samples=json.loads(samples_path.read_text()).get('native_samples',[])
        for source in registry['sources']:
            source['observations']=[s for s in samples if s['source_ref']==source['source_ref']]
    # Complete native evidence replaces bounded prototypes while retaining the
    # repository's required human admission gate. Rebuilding metadata cannot
    # silently discard these expensive, reproducible references.
    native_path=ROOT/'evidence/classification/full-native-audit.json'
    if native_path.exists():
        native=json.loads(native_path.read_text())
        if native['status']!='native-validated' or native['backend']!='local':raise ValueError('INCOMPLETE_NATIVE_AUDIT')
        stems={'dev.zip':'dev','test.zip':'test','TLS.tar.zst':'TLS','ULS.tar.zst':'ULS'}
        reports={name:json.loads((native_path.parent/'native'/(stem+'.json')).read_text()) for name,stem in stems.items()}
        for source in registry['sources']:
            ref=source['source_ref']
            source['observations']=[o for report in reports.values() for o in report['observations'] if o['source_ref']==ref]
            summary=native['sources'][ref]
            if len(source['observations'])!=summary['observations']:raise ValueError('NATIVE_MEMBERSHIP_CHANGED')
            source['native_audit']=dict(status='validated',backend='local',summary=summary,
                path=str(native_path.relative_to(ROOT)),sha256=sha(native_path.read_bytes()))
            source['blockers']=['Original-archive browser acceptance pending','Maintainer source admission required by CONTRIBUTING.md']
            for asset in source['assets']:
                if asset['name'] in reports:asset['sha256']=reports[asset['name']]['sha256']
            original=ROOT/'evidence/classification/full-browser-acceptance-inference.json'
            paired=ROOT/'evidence/classification/paired-browser-acceptance.json'
            if original.exists() and paired.exists():
                full=json.loads(original.read_text());bounded=json.loads(paired.read_text())
                if (full['status']!='original-archive-selection-validated' or len(full['runs'])!=2 or
                        bounded['status']!='bounded-native-samples-validated' or len(bounded['runs'])!=8):
                    raise ValueError('INCOMPLETE_PAIRED_BROWSER_ACCEPTANCE')
                source['browser_acceptance']=dict(status='validated',scope='Original archive traversal and bounded real paired views',
                    original_archive_report=str(original.relative_to(ROOT)),paired_report=str(paired.relative_to(ROOT)))
                source['blockers']=['Maintainer source admission required by CONTRIBUTING.md']
    (HERE/'source-lock.json').write_text(json.dumps(registry,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n')
    print(json.dumps(report['sources'], indent=2))


if __name__ == '__main__':
    build()
