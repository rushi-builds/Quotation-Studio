"""Run directly; all databases temporary and outside the repository."""
import copy
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import threading
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location('pulse_server', Path(__file__).with_name('pulse-server.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = 0


def check(value, name):
    global checks
    assert value, name
    checks += 1


def rejected(fn, error=(ValueError, sqlite3.IntegrityError)):
    global checks
    try: fn()
    except error: checks += 1; return
    raise AssertionError('Unsafe operation accepted')


def fixture():
    return {'leads': [
        {'id': 'a', 'company': 'A Company · Sample', 'stage': 'New', 'created': '2026-10-22', 'owner': 'Sales', 'source': 'Website', 'notes': []},
        {'id': 'b', 'company': 'A Company', 'stage': 'Survey', 'created': '2026-10-22', 'owner': 'Sales', 'source': 'Referral', 'notes': []}
    ], 'tasks': [], 'threads': [], 'calendar': [], 'events': [], 'rules': [], 'ops': {'jobs': [], 'audit': [], 'nextId': 1, 'quiet': {'start': 9, 'end': 18}}}


with tempfile.TemporaryDirectory(prefix='pulse-test-') as temp:
    path = Path(temp) / 'isolated.sqlite3'
    store = module.Store(path)
    check(store.read() == {'revision': 0, 'data': None}, 'fresh database genuinely empty')
    check(path.stat().st_mode & 0o777 == 0o600, 'database permissions private')
    data = fixture()
    check(store.save(data, 0)['revision'] == 1, 'first atomic save')
    check(module.Store(path).read()['data'] == data, 'durable reload / new Store instance')
    with store.connect() as db:
        check(db.execute('SELECT count(*) FROM organisations').fetchone()[0] == 1, 'repeat opportunities share organisation')
        check(db.execute('SELECT count(*) FROM opportunities').fetchone()[0] == 2, 'distinct opportunities retained')
        check(db.execute('SELECT count(*) FROM contacts').fetchone()[0] == 2, 'separate contact identities retained')
        check(not db.execute('PRAGMA foreign_key_check').fetchall(), 'relational links valid')
    rejected(lambda: store.save(data, 0), module.Conflict)
    rejected(lambda: module.Store(Path(__file__).parent / 'unsafe.sqlite3'))
    invalid = copy.deepcopy(data); invalid['tasks'] = [{'id': 'orphan', 'leadId': 'missing'}]
    rejected(lambda: store.save(invalid, 1))
    invalid = copy.deepcopy(data); invalid['leads'].append(invalid['leads'][0])
    rejected(lambda: store.save(invalid, 1))
    invalid = copy.deepcopy(data); invalid['secretToken'] = 'not-accepted'
    rejected(lambda: store.save(invalid, 1))
    invalid = copy.deepcopy(data); invalid['leads'][0]['__proto__'] = {'polluted': True}
    rejected(lambda: store.save(invalid, 1))
    check(store.read()['revision'] == 1, 'rejections do not increment revision')
    invalid = copy.deepcopy(data); invalid['ops']['jobs'] = [{'id': 'bad', 'key': 'bad', 'leadId': 'a', 'channel': 'Gmail', 'status': 'Done'}]
    rejected(lambda: store.save(invalid, 1))
    check(store.read()['data'] == data, 'failed SQL validation rolls back snapshot and relational projection')
    data['ops']['audit'] = [{'id': 'audit-1', 'type': 'Test', 'at': '2026-10-22T04:30:00Z', 'detail': 'Original', 'actor': 'Sandbox operator'}]
    data['ops']['nextId'] = 2
    check(store.save(data, 1)['revision'] == 2, 'append control history')
    invalid = copy.deepcopy(data); invalid['ops']['audit'] = []
    rejected(lambda: store.save(invalid, 2))
    invalid = copy.deepcopy(data); invalid['ops']['audit'][0]['detail'] = 'Rewrite'
    rejected(lambda: store.save(invalid, 2))
    check(store.read()['data']['ops']['audit'][0]['detail'] == 'Original', 'control history immutable in durable layer')
    invalid = copy.deepcopy(data); invalid['leads'][0]['notes'] = ['x' * module.MAX_BODY]
    rejected(lambda: store.save(invalid, 2))
    # Exercise real worker boundary, then repeat a tick and reopen database.
    data['rules'] = [{'id': 'r', 'name': 'New enquiry task', 'trigger': 'New lead', 'source': 'All sources', 'action': 'Create internal follow-up', 'owner': 'Sales', 'status': 'Draft'}]
    js = "const O=require('./concept-preview/pulse-operations.js');const d=JSON.parse(require('fs').readFileSync(0,'utf8'));O.transition(d,d.rules[0],'Needs approval',1792643400000);O.transition(d,d.rules[0],'Approved',1792643400000);O.transition(d,d.rules[0],'Active',1792643400000);process.stdout.write(JSON.stringify(d));"
    import subprocess
    data = json.loads(subprocess.check_output(['node', '-e', js], input=json.dumps(data), text=True, cwd=module.ROOT))
    store.save(data, 2)
    check(store.tick(1792643400000), 'real isolated worker saves internal effects')
    check(len(store.read()['data']['tasks']) == 2, 'one internal task per matched opportunity')
    check(not store.tick(1792643400000), 'idempotent repeated worker tick')
    check(len(module.Store(path).read()['data']['tasks']) == 2, 'internal worker effects survive reopening database')
    backup = Path(temp) / 'backup.json'
    backup_data = store.read()['data']
    backup_data['ops']['jobs'].append({'id': 'external-draft', 'key': 'manual-test', 'leadId': 'a', 'channel': 'Gmail', 'status': 'Needs approval', 'approval': True})
    backup.write_text(json.dumps({'format': 'studio-pulse-sample', 'version': 1, 'data': backup_data}))
    restored = module.Store(Path(temp) / 'restored.sqlite3')
    check(module.restore_backup(restored, backup)['revision'] == 1, 'sample backup restores to a new durable database')
    check(all(r['status'] == 'Draft' and 'approval' not in r for r in restored.read()['data']['rules']), 'restore invalidates every rule approval')
    check(restored.read()['data']['ops']['jobs'][-1]['status'] == 'Cancelled', 'restore cancels pending external outreach')
    check(restored.read()['data']['ops']['audit'][0]['type'] == 'Sample backup restored', 'restore provenance audited')
    rejected(lambda: module.restore_backup(restored, backup))
    backup.write_text(json.dumps({'format': 'unknown', 'version': 1, 'data': backup_data}))
    rejected(lambda: module.restore_backup(module.Store(Path(temp) / 'wrong.sqlite3'), backup))
    # HTTP API: session token, same-origin, size/JSON, isolation and version safety.
    httpd = module.server(store, 0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    origin = 'http://127.0.0.1:' + str(httpd.server_port)
    def request(path, method='GET', body=None, headers=None):
        req = urllib.request.Request(origin + path, data=body, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as response: return response.status, response.read(), dict(response.headers)
        except urllib.error.HTTPError as error: return error.code, error.read(), dict(error.headers)
    try:
        code, html, headers = request('/concept-preview/dashboard.html')
        check(code == 200, 'persistent dashboard served')
        token = re.search(r'name="pulse-local-csrf" content="([^"]+)"', html.decode())[1]
        check("connect-src 'self'" in html.decode(), 'explicit local mode permits same-origin API')
        check("connect-src 'none'" in (module.ROOT / 'concept-preview/dashboard.html').read_text(), 'static preview CSP unchanged')
        check('no-store' in headers['Cache-Control'], 'token/data responses not cached')
        endpoint = '/concept-preview/pulse-api/workspace'
        check(request(endpoint)[0] == 403, 'API rejects missing session token')
        auth = {'X-Pulse-CSRF': token}
        check(request(endpoint, headers={**auth, 'Origin': 'https://other.example'})[0] == 403, 'API rejects cross-origin requests')
        check(request(endpoint, headers={**auth, 'Sec-Fetch-Site': 'cross-site'})[0] == 403, 'cross-site fetch metadata denied')
        code, body, _ = request(endpoint, headers=auth)
        payload = json.loads(body)
        check(code == 200 and payload['externalSending'] is False, 'read API reports external sending disabled')
        check(payload['scheduler'] is False, 'scheduler does not silently activate')
        saved = json.dumps({'revision': payload['revision'], 'data': payload['data']}).encode()
        check(request(endpoint, 'PUT', saved, auth)[0] == 415, 'non-JSON writes rejected')
        check(request(endpoint, 'PUT', saved, {**auth, 'Content-Type': 'application/json'})[0] == 200, 'authorised versioned write accepted')
        check(request(endpoint, 'PUT', saved, {**auth, 'Content-Type': 'application/json'})[0] == 409, 'stale tab cannot overwrite newer data')
        check(request('/api/proposals', headers=auth)[0] == 403, 'production API inaccessible')
        check(request('/.git/config')[0] == 404, 'Git internals inaccessible')
        check(request('/concept-preview/../../.env')[0] == 404, 'traversal and private files inaccessible')
        check(request(endpoint, 'OPTIONS')[0] == 403, 'no cross-origin preflight access')
        check(request(endpoint, 'POST', b'{}', auth)[0] == 405, 'unexpected write method denied')
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join()
print('PASS:', checks, 'isolated SQLite / worker / HTTP safety checks.')
