"""Transfer integrity, range resumption and failure behavior on an offline server."""
import functools
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from classification.acquire import download


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.folder=Path(self.temp.name)
        self.data=bytes(range(251))*1000;self.requests=[];self.wrong_range=False
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*_):pass
            def do_GET(self):
                requested=self.headers.get('Range');owner.requests.append(requested)
                if requested:
                    match=re.fullmatch(r'bytes=(\d+)-(\d*)',requested);start=int(match[1]);end=int(match[2]) if match[2] else len(owner.data)-1
                    self.send_response(206);self.send_header('Content-Range',f'bytes {start+int(owner.wrong_range)}-{end}/{len(owner.data)}')
                else:start,end=0,len(owner.data)-1;self.send_response(200)
                content=owner.data[start:end+1];self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.asset=dict(source_ref='zenodo:13255198',name='dev.zip',size_bytes=len(self.data),
                        checksum='md5:'+hashlib.md5(self.data).hexdigest(),url=f'http://127.0.0.1:{self.server.server_port}/archive')

    def test_complete_transfer_and_verified_reuse(self):
        report=download(self.asset,self.folder)
        self.assertEqual(report['sha256'],hashlib.sha256(self.data).hexdigest())
        self.assertEqual((self.folder/'dev.zip').read_bytes(),self.data)
        self.requests.clear();download(self.asset,self.folder);self.assertEqual(self.requests,[])
        (self.folder/'dev.zip').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'EXISTING_ARCHIVE_CORRUPTED'):download(self.asset,self.folder)

    def test_parallel_ranges_preserve_prefix_and_reconstruct_exact_original(self):
        identity={k:self.asset[k] for k in ['source_ref','name','size_bytes','checksum','url']}
        (self.folder/'dev.zip.input.json').write_text(json.dumps(identity));(self.folder/'dev.zip.part').write_bytes(self.data[:1234])
        with patch('classification.acquire.RANGE_BYTES',8192):report=download(self.asset,self.folder,4)
        self.assertEqual(report['sha256'],hashlib.sha256(self.data).hexdigest())
        self.assertEqual((self.folder/'dev.zip').read_bytes(),self.data)
        self.assertTrue(all(int(re.match(r'bytes=(\d+)',r)[1])>=1234 for r in self.requests))
        self.assertFalse((self.folder/'dev.zip.ranges').exists())

    def test_inconsistent_ranges_and_bad_checksums_never_publish_an_original(self):
        self.wrong_range=True
        with patch('classification.acquire.RANGE_BYTES',8192):
            with self.assertRaisesRegex(ValueError,'RANGE_MISMATCH'):download(self.asset,self.folder,4)
        self.assertFalse((self.folder/'dev.zip').exists())
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,'CHECKSUM_MISMATCH'):download(dict(self.asset,checksum='md5:'+'0'*32),Path(folder))
            self.assertFalse((Path(folder)/'dev.zip').exists())


if __name__=='__main__':unittest.main()
