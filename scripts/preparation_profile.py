"""Closed local adapter dispatch for reviewed preparation implementations.

Source admission remains in the graph. Producer and independent reader retain
separate scientific policies; this module only selects their implementation.
"""
from pathlib import Path

RECORD_ID = 8287792


def require_record(record_id):
    if int(record_id) != RECORD_ID:
        raise ValueError('No admitted local preparation implementation for this source')


def status(package, web):
    from for_instance.prepare import package_fingerprint, read
    from knowledge_model import load
    model = load(web / 'knowledge-model.json')
    if not model['nodes']['pipeline:for-instance-plot-instances:1.0.0']['data']['execution_enabled']:
        raise ValueError('FOR-instance preparation is not enabled by the reviewed model')
    validation = read(web / 'evidence/for-instance-preparation-validation.json')
    fingerprint = package_fingerprint(package)
    if validation.get('status') != 'succeeded' or validation.get('package_sha256') != fingerprint or validation.get('plots') != 32 or validation.get('points') != 151478959:
        raise ValueError('FOR-instance preparation has not passed complete-source validation')
    return {'record_id':8287792, 'pipeline':'for-instance-plot-instances:1.0.0',
            'package_sha256':fingerprint, 'scope':'32 archive plots; 50 NIBIO2 split rows absent',
            'available':True}


def validate_input(root, output, package, preparation, destination):
    from for_instance.prepare import source_selection, read
    status = preparation
    destination(root, output, status['package_sha256'])
    source_selection(root, read(package / 'source-lock.json'))
    return status


def command(python, package, root, output):
    return [python, str(package / 'prepare.py'), '--input', str(root), '--output', str(output)]


def open_package(output, package):
    from task_package import TaskPackage
    return TaskPackage(Path(output), profile=package)
