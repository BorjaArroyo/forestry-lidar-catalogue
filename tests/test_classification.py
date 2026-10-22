"""Classification semantics, immutable identities and independent package checks."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from classification.model import load_registry,validate_registry,select,resolve,check,PARTITIONS
from classification.canonical import fingerprint
from classification.snapshot import FOR,BIODIV
from source_identity import source_ref


def fixture_context():
    registry,vocabulary,native=load_registry()
    registry=copy.deepcopy(registry)
    mapping=next(m for m in vocabulary['mappings'] if m['source_ref']==BIODIV and m['native_label']=='Quercus_spec')
    trees=[]
    for ref,identity,split,label in [(FOR,'F1','dev','Picea_abies'),(FOR,'F2','test',None),
        (BIODIV,'B1','train','Quercus_spec'),(BIODIV,'B2','validate','Picea_abies'),
        (BIODIV,'B3','test','Picea_abies'),(BIODIV,'B4','unassigned','Picea_abies')]:
        m=next((m for m in vocabulary['mappings'] if m['source_ref']==ref and m['native_label']==label),None)
        tree=dict(source_ref=ref,tree_id=identity,native_label=label,
                  taxonomy={rank:m[rank] if m else None for rank in vocabulary['ranks']},
                  reference_valid={rank:bool(m and m[rank]) for rank in vocabulary['ranks']},
                  collection='shared-plot',published_split=split,modalities=['TLS'] if ref==FOR else [],native_metadata={'dbh':'provenance-only'})
        trees.append(tree)
    for source in registry['sources']:
        source.update(status='validated',execution_enabled=True,blockers=[],
            native_audit={'status':'validated','scope':'synthetic-test-fixture'},browser_acceptance={'status':'validated','scope':'synthetic-test-fixture'},observations=[])
        for tree in trees:
            if tree['source_ref']!=source['source_ref']: continue
            for mode in ['TLS'] if source['source_ref']==FOR else ['TLS','ULS']:
                source['observations'].append(dict(source_ref=tree['source_ref'],tree_id=tree['tree_id'],
                    observation_id=tree['tree_id']+':'+mode,modality=mode,path=f'{mode}/{tree["tree_id"]}.laz',
                    archive=('dev.zip' if tree['published_split']=='dev' else 'test.zip') if tree['source_ref']==FOR else mode+'.tar.zst',
                    points=3,point_record_length=20,size_bytes=100,sha256='a'*64,native_records_sha256='b'*64,
                    published_split=tree['published_split'],collection=tree['collection']))
    return registry,vocabulary,trees


def subset(ref,partitions=None):
    return dict(source_ref=ref,collections=['shared-plot'],modalities=['TLS'] if ref==FOR else ['TLS','ULS'],
                partitions=partitions or PARTITIONS['inference'],taxa=[],tree_ids=[])


class ClassificationTests(unittest.TestCase):
    def test_original_tables_and_genus_only_labels(self):
        registry,vocab,trees=load_registry()
        native=[t for t in trees if t['source_ref']==BIODIV]
        self.assertEqual(len(native),4952)
        self.assertEqual(sum(not t['reference_valid']['species'] for t in native),213)
        self.assertEqual(sum(t['published_split']=='unassigned' for t in native),5)
        self.assertEqual(len({t['collection'] for t in native}),27)
        self.assertTrue(all(not s['execution_enabled'] for s in registry['sources']))
        inventory=json.loads((ROOT/'evidence/classification/for-member-inventory.json').read_text())
        join=next(i for i in inventory['issues'] if 'missing_label_members' in i)
        self.assertEqual(join['missing_label_members'],[])
        self.assertEqual(join['unlabelled_members'],[])
        quercus=next(t for t in native if t['native_label']=='Quercus_spec')
        self.assertEqual(quercus['taxonomy'],{'genus':'taxon:genus:Quercus','species':None})

    def test_provider_independent_source_id(self):
        self.assertEqual(source_ref(8287792),'zenodo:8287792')
        self.assertEqual(source_ref(BIODIV),BIODIV)
        for invalid in ['grodata:128035','zenodo:latest','../13255198','13255198:latest']:
            with self.assertRaises(ValueError): source_ref(invalid)

    def test_changed_original_label_table_is_rejected(self):
        import shutil
        from classification.snapshot import HERE
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for name in ['source-lock.json','vocabulary.json','trees.json']:
                shutil.copyfile(HERE/name,root/name)
            shutil.copytree(HERE/'sources',root/'sources')
            path=root/'sources/biodiv-labels.csv';path.write_bytes(path.read_bytes()+b'\n')
            with self.assertRaisesRegex(ValueError,'SOURCE_TABLE_CHANGED'):load_registry(root)

    def test_rank_specific_supervision_and_exact_partitions(self):
        registry,vocab,trees=fixture_context()
        filters=[subset(BIODIV)]
        selected,excluded=select(registry,vocab,trees,use='training',rank='genus',filters=filters)
        self.assertEqual({o['tree_id'] for o in selected},{'B1'})
        self.assertEqual({o['modality'] for o in selected},{'TLS','ULS'})
        selected,_=select(registry,vocab,trees,use='training',rank='species',filters=filters)
        self.assertEqual(selected,[])
        for use,identity,split in [('validation','B2','validate'),('evaluation','B3','test')]:
            selected,_=select(registry,vocab,trees,use=use,rank='species',filters=filters)
            self.assertEqual({o['tree_id'] for o in selected},{identity})
            self.assertEqual({o['published_split'] for o in selected},{split})
        selected,_=select(registry,vocab,trees,use='inference',filters=filters)
        self.assertIn('B4',{o['tree_id'] for o in selected})
        selected,_=select(registry,vocab,trees,use='evaluation',filters=[subset(FOR)])
        self.assertEqual(selected,[])
        selected,_=select(registry,vocab,trees,use='inference',filters=[subset(FOR)])
        self.assertIn('F2',{o['tree_id'] for o in selected})

    def test_missing_committed_view_cannot_be_exported(self):
        r,v,t=fixture_context();r['sources'][1]['observations']=[o for o in r['sources'][1]['observations'] if not(o['tree_id']=='B1' and o['modality']=='ULS')]
        selected,excluded=select(r,v,t,use='training',rank='genus',filters=[subset(BIODIV)])
        self.assertEqual(selected,[])
        self.assertIn('COMMITTED_MODALITY_MISSING',{x['reason'] for x in excluded})

    def test_duplicate_cloud_findings_never_assign_test_labels_or_merge_ids(self):
        r,v,t=fixture_context()
        finding=dict(sha256='a'*64,observations=['F1:TLS','F2:TLS'],published_splits=['dev','test'])
        r['sources'][0]['native_audit']['summary']={'byte_identical_cloud_groups':[finding]}
        plan=resolve(r,v,t,use='inference',filters=[subset(FOR)],runtime_sha256='c'*64,code_sha256='d'*64)
        self.assertEqual(plan['totals']['trees'],2)
        test=next(tree for tree in plan['trees'] if tree['tree_id']=='F2')
        self.assertIsNone(test['native_label']);self.assertFalse(test['reference_valid']['species'])
        self.assertEqual(plan['spatial_audit']['source_scope_cloud_duplicates'],{FOR:[finding]})
        selected,_=select(r,v,t,use='evaluation',filters=[subset(FOR)])
        self.assertEqual(selected,[])

    def test_duplicate_identities_and_modified_taxonomy_fail(self):
        for mutate in [lambda r,v,t:t.append(t[0]),lambda r,v,t:r['sources'][0]['observations'].append(r['sources'][0]['observations'][0]),
                       lambda r,v,t:t[0]['taxonomy'].update(species='taxon:species:Quercus_rubra'),
                       lambda r,v,t:v['mappings'].append(v['mappings'][0])]:
            r,v,t=fixture_context();mutate(r,v,t)
            with self.assertRaises(ValueError):validate_registry(r,v,t)

    def test_fixed_vocabulary_and_plan_bindings(self):
        r,v,t=fixture_context()
        pins=dict(runtime_sha256='c'*64,code_sha256='d'*64)
        plan=resolve(r,v,t,use='inference',filters=[subset(FOR),subset(BIODIV)],**pins)
        self.assertEqual(plan['totals']['trees'],6)
        self.assertEqual(plan['totals']['observations'],10)
        self.assertEqual(len(plan['vocabulary']['taxa']),len(v['taxa']))
        self.assertEqual(plan['output']['partitions'],['dev','test','train','unassigned','validate'])
        self.assertEqual(plan['spatial_audit']['independence'],'not-demonstrated')
        self.assertEqual(len(plan['spatial_audit']['shared_plots']),2)
        self.assertEqual(check(r,v,t,plan,**pins),plan)
        for change in ['points','runtime','taxonomy']:
            bad=copy.deepcopy(plan)
            if change=='points':bad['observations'][0]['points']+=1
            if change=='runtime':bad['runtime_sha256']='e'*64
            if change=='taxonomy':bad['vocabulary']['taxa'][0]['code']=999
            with self.assertRaises(ValueError):check(r,v,t,bad,**pins)
        with self.assertRaisesRegex(ValueError,'PLAN_REVIEW_REQUIRED'):check(r,v,t,{'schema_version':'2.0.0'},**pins)
        r['sources'][1]['execution_enabled']=False
        with self.assertRaisesRegex(ValueError,'SOURCE_WIP'):resolve(r,v,t,use='inference',filters=[subset(FOR),subset(BIODIV)],**pins)

    def test_biodiv_real_cost_is_full_archive_and_vocabulary_is_selection_stable(self):
        r,v,t=fixture_context();pins=dict(runtime_sha256='c'*64,code_sha256='d'*64)
        plan=resolve(r,v,t,use='validation',filters=[subset(BIODIV)],**pins)
        self.assertEqual(plan['totals']['sequential_download_bytes'],19941204645+652222562)
        smaller=resolve(r,v,t,use='evaluation',filters=[subset(BIODIV)],**pins)
        self.assertEqual(smaller['vocabulary'],plan['vocabulary'])
        self.assertEqual(smaller['totals']['sequential_download_bytes'],plan['totals']['sequential_download_bytes'])


if __name__=='__main__':unittest.main()
