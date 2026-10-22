"""Audit all four local original archives into reproducible per-archive reports."""
import argparse
import json
from pathlib import Path

from classification.acquire import ARCHIVES
from classification.audit import audit_archive
from classification.model import load_registry
from classification.snapshot import ROOT,write


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--originals',type=Path,default=ROOT/'temp/classification/originals')
    parser.add_argument('--output',type=Path,default=ROOT/'temp/classification/reproduced-native')
    args=parser.parse_args();registry,_,rows=load_registry()
    trees={(t['source_ref'],t['tree_id']):t for t in rows}
    assets=[(s['source_ref'],a) for s in registry['sources'] for a in s['assets'] if a['name'] in ARCHIVES]
    if {a['name'] for _,a in assets}!=ARCHIVES or any(not (args.originals/a['name']).is_file() for _,a in assets):
        parser.error('All four complete original point archives are required')
    for ref,asset in assets:
        stem=asset['name'].split('.')[0]
        report=audit_archive(args.originals/asset['name'],ref,asset,trees,args.output/(stem.lower()+'-stage'))
        write(args.output/(stem+'.native.json'),report)
        print(json.dumps(dict(archive=asset['name'],observations=len(report['observations']),
                              points=sum(o['points'] for o in report['observations']),sha256=report['sha256'])),flush=True)


if __name__=='__main__':main()
