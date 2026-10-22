"""Request parsing is independent of internal execution and durable state."""

import contextlib
import io
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest

from canopy.service.app import Service
from canopy.service.config import ServiceConfig
from canopy.service.http import create_handler
from canopy.service.storage import RequestError, read


class HttpBoundaryTests(unittest.TestCase):
    def handler(self, payload=b'{}', api=None, path='/api/jobs'):
        service = api or SimpleNamespace(TOKEN='fixture', submit=lambda body: {'accepted': True})
        handler = object.__new__(create_handler(service))
        handler.local = lambda: True
        handler.server = SimpleNamespace(server_port=8765)
        handler.path = path
        handler.headers = {'X-Canopy-Token': 'fixture', 'Content-Length': str(len(payload))}
        handler.rfile = io.BytesIO(payload)
        responses = []
        handler.send_json = lambda data, status=200: responses.append((status, data))
        return handler, responses

    def test_invalid_requests_return_400_before_execution(self):
        for payload in [b'{', b'null', b'[]', b'0', b'"string"', b'\xff']:
            with self.subTest(payload=payload):
                handler, responses = self.handler(payload)
                handler.do_POST()
                self.assertEqual(responses[0][0], 400)
        handler, responses = self.handler(path='/api/inspect')
        handler.do_POST()
        self.assertEqual(responses[0][0], 400)

    def test_expected_input_errors_return_400(self):
        def submit(body):
            raise RequestError('Invalid destination')
        handler, responses = self.handler(api=SimpleNamespace(TOKEN='fixture', submit=submit))
        handler.do_POST()
        self.assertEqual(responses, [(400, {'error': 'Invalid destination'})])

    def test_internal_errors_return_500_and_log_the_cause(self):
        for error in [ValueError('internal value'), KeyError('internal key'), OSError('disk failure')]:
            with self.subTest(error=error):
                def submit(body):
                    raise error
                handler, responses = self.handler(api=SimpleNamespace(TOKEN='fixture', submit=submit))
                diagnostic = io.StringIO()
                with contextlib.redirect_stderr(diagnostic):
                    handler.do_POST()
                self.assertEqual(responses, [(500, {'error': 'Internal service error'})])
                self.assertIn(str(error), diagnostic.getvalue())

    def test_corrupt_persisted_json_is_an_internal_error(self):
        with tempfile.TemporaryDirectory() as scratch:
            service = Service(ServiceConfig(state_root=Path(scratch)))
            target = service.STATE / 'jobs/fixture/job.json'
            target.parent.mkdir(parents=True)
            target.write_text('{')
            handler, responses = self.handler(api=service, path='/api/state')
            diagnostic = io.StringIO()
            with contextlib.redirect_stderr(diagnostic):
                handler.do_GET()
            self.assertEqual(responses[0][0], 500)
            self.assertIn(str(target), diagnostic.getvalue())
            with self.assertRaises(RuntimeError):
                read(target)

    def test_services_do_not_share_tokens_or_configuration(self):
        with tempfile.TemporaryDirectory() as scratch:
            first = Service(ServiceConfig(state_root=Path(scratch)/'first'))
            second = Service(ServiceConfig(state_root=Path(scratch)/'second'))
            self.assertNotEqual(first.TOKEN, second.TOKEN)
            self.assertIsNot(first.GUARD, second.GUARD)
            self.assertNotEqual(first.STATE, second.STATE)
            self.assertFalse(first.STATE.exists())
            self.assertFalse(second.STATE.exists())
