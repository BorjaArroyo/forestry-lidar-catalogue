"""Check the bounded LAS operation and browser prototype's immutable artifacts."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'container-lab'
spec=importlib.util.spec_from_file_location('las_inspector',LAB/'inspect_las.py')
inspector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)

class BrowserContainer(unittest.TestCase):
    def setUp(self):
        self.data=(LAB/'sample.las').read_bytes()
    def test_golden_coordinates_preserve_projected_precision(self):
        result=inspector.inspect(self.data)
        self.assertEqual(result['point_count'],3)
        self.assertEqual(result['bounds'],{'min':[499998.25,5999999.0,98.0],'max':[500003.5,6000004.0,102.5]})
        self.assertEqual(result['input_sha256'],'0a25ed326175abc2956c58f24fb89a1b15e366801ad7fa84f44e0732debef680')
    def test_rejects_signature_truncation_and_input_above_limit(self):
        for data in [b'BAD!'+self.data[4:],self.data[:-1],b'0'*1048577]:
            with self.subTest(size=len(data)),self.assertRaises(ValueError):inspector.inspect(data)
    def test_rejects_compressed_and_unknown_point_formats(self):
        for value in [135,11]:
            data=bytearray(self.data);data[104]=value
            with self.subTest(format=value),self.assertRaises(ValueError):inspector.inspect(data)
    def test_rejects_bad_coordinate_scaling(self):
        for value in [0,float('nan'),float('inf')]:
            data=bytearray(self.data);struct.pack_into('<d',data,131,value)
            with self.subTest(scale=value),self.assertRaises(ValueError):inspector.inspect(data)
    def test_empty_cloud_has_no_invented_bounds(self):
        data=bytearray(self.data);struct.pack_into('<Q',data,247,0)
        result=inspector.inspect(data);self.assertEqual(result['point_count'],0);self.assertIsNone(result['bounds'])
    def test_fixed_operation_and_runtime_are_pinned(self):
        lock=json.loads((LAB/'runtime-lock.json').read_text())
        self.assertEqual(lock['operation_sha256'],hashlib.sha256((LAB/'inspect_las.py').read_bytes()).hexdigest())
        self.assertEqual(sum(f['size_bytes'] for f in lock['files']),145588571)
        self.assertEqual(lock['wasm_sha256'],'ed78cdc4ab4e1334ec7396eda4db5bc058e4e42825142af06096e1fd762275e3')
        self.assertIn(lock['commit'],lock['base_url'])
        self.assertEqual(lock['shim']['version'],'0.4.2')

    def test_real_for_instance_subset_matches_native_reference(self):
        data=(LAB/'real-subset.las').read_bytes()
        lock=json.loads((LAB/'runtime-lock.json').read_text())['real_subset']
        self.assertEqual(hashlib.sha256(data).hexdigest(),lock['sha256'])
        self.assertEqual(lock['source_record'],'8287792')
        self.assertEqual(lock['license'],'cc-by-4.0')
        result=inspector.inspect(data)
        self.assertEqual(result['point_count'],20000)
        self.assertEqual(result['point_format'],2)
        self.assertEqual(result['finite_xyz_points'],20000)
        self.assertEqual(result['bounds'],{'min':[1886524.87,5771858.677,0.0],'max':[1886537.936,5771873.654,21.7]})
        self.assertEqual(result['input_sha256'],lock['sha256'])

if __name__=='__main__':unittest.main()
