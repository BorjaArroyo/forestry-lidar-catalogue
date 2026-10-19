"""Check pinned-record drift detection without network access."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from check_pinned_sources import compare_record


class CompareRecord(unittest.TestCase):
    def setUp(self):
        self.expected = [
            {'name': 'a.zip', 'size_bytes': 10, 'provider_checksum': 'md5:aa'},
            {'name': 'b.zip', 'size_bytes': 20, 'provider_checksum': 'md5:bb'},
        ]

    def observed(self, files):
        return [{'name': name, 'size': size, 'checksum': checksum}
                for name, size, checksum in files]

    def test_unchanged_record_reports_no_problems(self):
        observed = self.observed([('a.zip', 10, 'md5:aa'), ('b.zip', 20, 'md5:BB')])
        self.assertEqual(compare_record(self.expected, observed), [])

    def test_size_checksum_missing_and_added_files_are_each_reported(self):
        observed = self.observed([('a.zip', 11, 'md5:aa'), ('c.zip', 5, 'md5:cc')])
        problems = compare_record(self.expected, observed)
        self.assertTrue(any('size 11 != pinned 10' in problem for problem in problems))
        self.assertTrue(any('no longer published' in problem for problem in problems))
        self.assertTrue(any('added to the record after pinning' in problem for problem in problems))
        self.assertEqual(len(problems), 3)

    def test_checksum_drift_is_reported(self):
        observed = self.observed([('a.zip', 10, 'md5:xx'), ('b.zip', 20, 'md5:bb')])
        self.assertEqual(compare_record(self.expected, observed),
                         ['a.zip: checksum md5:xx != pinned md5:aa'])

    def test_zenodo_entries_naming_files_key_are_accepted(self):
        observed = [{'key': 'a.zip', 'size': 10, 'checksum': 'md5:aa'},
                    {'key': 'b.zip', 'size': 20, 'checksum': 'md5:bb'}]
        self.assertEqual(compare_record(self.expected, observed), [])


if __name__ == '__main__':
    unittest.main()
