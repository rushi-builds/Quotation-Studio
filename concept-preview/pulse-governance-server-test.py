"""Role-bound command endpoint checks, isolated disposable SQLite only."""
import copy
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location('pulse_server', Path(__file__).with_name('pulse-server.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = 0

def check(value, name):
    global checks
    assert value, name
    checks += 1

def fixture():
    return {'leads': [{'id': 'a', 'company': 'Alpha', 'owner': 'Sales', 'stage': 'New', 'created': '2000-01-01', 'notes': []}, {'id': 'b', 'company': 'Beta', 'owner': 'Other', 'stage': 'Survey', 'created': '2000-01-01', 'notes': []}], 'tasks': [{'id': 't', 'leadId': 'a', 'title': 'Call customer', 'date': '2000-01-02', 'time': '09:00', 'status': 'open'}], 'calendar': [], 'threads': [], 'events': [], 'rules': [], 'ops': {'jobs': [], 'audit': [], 'nextId': 1, 'quiet': {'start': 9, 'end': 18}}}

with tempfile.TemporaryDirectory(prefix='pulse-governance-') as temp:
    store = m.Store(Path(temp) / 'sample.sqlite3')
    store.save(fixture(), 0)
    servers, clients = [], {}
    for role in ['Owner', 'Admin', 'Member', 'Viewer']:
        httpd = m.server(store, 0, role=role, actor_name=role + ' server actor', owner_name='Sales')
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        servers.append(httpd)
        base = 'http://127.0.0.1:' + str(httpd.server_port)
        page = urllib.request.urlopen(base + '/concept-preview/dashboard.html').read().decode()
        token = re.search(r'name="pulse-local-csrf" content="([^"]+)"', page)[1]
        clients[role] = (base, token)
        check('name="pulse-access-role" content="' + role + '"' in page, 'fixed server role injected ' + role)
    def request(role, method='GET', path='workspace', payload=None, headers=None):
        base, token = clients[role]
        req = urllib.request.Request(base + '/concept-preview/pulse-api/' + path, method=method, data=None if payload is None else json.dumps(payload).encode(), headers={'X-Pulse-CSRF': token, 'Content-Type': 'application/json', **(headers or {})})
        try:
            response = urllib.request.urlopen(req)
            return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())
    def control(role, command, revision=None, extra=None):
        return request(role, 'POST', 'control', {'revision': store.read()['revision'] if revision is None else revision, 'command': command, **(extra or {})})
    try:
        for role in clients:
            code, result = request(role)
            check(code == 200 and result['actor']['role'] == role, 'actor from server ' + role)
        add = {'type': 'connections.add', 'items': [{'provider': 'Gmail', 'label': 'Sales mailbox'}, {'provider': 'Slack', 'label': 'Operations'}]}
        for role in ['Member', 'Viewer']:
            check(control(role, add)[0] == 403, role + ' cannot add')
            check(request(role, 'PUT', payload={'revision': store.read()['revision'], 'data': fixture()})[0] == 403, role + ' cannot generic save')
            check(control(role, add, extra={'actor': {'id': 'fake', 'role': 'Owner'}})[0] == 400, 'actor envelope rejected ' + role)
            check(control(role, {**add, 'actor': {'id': 'fake', 'role': 'Owner'}, 'role': 'Owner'})[0] == 403, 'nested actor cannot elevate ' + role)
        original = store.read()
        code, result = control('Owner', add)
        check(code == 200 and len(result['data']['governance']['connections']) == 2, 'owner atomic batch')
        check(all(a['role'] == 'Owner' and a['actor'] == 'Owner server actor' for a in result['data']['governance']['audit']), 'trusted identity audit')
        check(control('Owner', add, revision=original['revision'])[0] == 409, 'stale command CAS')
        identity = result['data']['governance']['connections'][0]['id']
        before = store.read()
        invalid = {'type': 'connections.add', 'items': [{'provider': 'Google Drive', 'label': 'Valid'}, {'provider': 'Gmail', 'label': 'Sales mailbox'}]}
        check(control('Admin', invalid)[0] == 400, 'invalid batch rejected')
        check(store.read() == before, 'no partial account/audit/revision on failure')
        code, result = control('Admin', {'type': 'connections.archive', 'id': identity, 'reason': 'No longer needed for this team'})
        check(code == 200 and result['data']['governance']['connections'][0]['archived'], 'admin archive')
        code, result = control('Admin', {'type': 'connections.restore', 'id': identity, 'reason': 'Prepare this account again'})
        check(code == 200 and not result['data']['governance']['connections'][0]['archived'], 'admin restore')
        before = store.read()
        for mutate in ['omit', 'clear', 'audit', 'forged']:
            data = copy.deepcopy(before['data'])
            if mutate == 'omit': data.pop('governance')
            elif mutate == 'clear': data['governance']['connections'] = []
            elif mutate == 'audit': data['governance']['audit'][0]['actor'] = 'Forged'
            else: data['governance']['connections'].append({'id': 'fake', 'provider': 'Gmail', 'label': 'Bypass'})
            check(request('Owner', 'PUT', payload={'revision': before['revision'], 'data': data})[0] == 400, 'generic PUT cannot bypass governance: ' + mutate)
            check(store.read() == before, 'protected workspace unchanged: ' + mutate)
        # Commands use the same pure domain occurrence signature as the browser.
        script = "const O=require('./concept-preview/pulse-operations.js'),G=require('./concept-preview/pulse-governance.js'),d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(O.desk(d,Date.now()).map(r=>({...r,signature:G.signature(d,r)}))));"
        rows = json.loads(subprocess.check_output(['node', '-e', script], input=json.dumps(store.read()['data']), text=True, cwd=m.ROOT))
        own = next(r for r in rows if r['kind'] == 'Overdue')
        other = next(r for r in rows if r['leadId'] == 'b')
        def alert(row, kind): return {'type': kind, 'rowId': row['id'], 'signature': row['signature'], 'reason': 'Customer requested a later review'}
        check(control('Member', alert(own, 'alerts.dismiss'))[0] == 403, 'member cannot dismiss directly')
        check(control('Viewer', alert(own, 'alerts.request'))[0] == 403, 'viewer cannot request')
        check(control('Member', alert(other, 'alerts.request'))[0] == 400, 'member cannot request other owner')
        check(control('Owner', {**alert(own, 'alerts.dismiss'), 'signature': 'stale'})[0] == 400, 'stale occurrence rejected')
        code, result = control('Member', alert(own, 'alerts.request'))
        check(code == 200, 'member assigned review request')
        review = result['data']['governance']['requests'][0]
        check(review['actor'] == 'Member server actor', 'request trusted actor')
        approve = {'type': 'requests.approve', 'id': review['id'], 'reason': 'Reviewed and approved by workspace owner'}
        check(control('Member', approve)[0] == 403, 'member cannot self-approve')
        code, result = control('Admin', approve)
        check(code == 200 and result['data']['governance']['requests'][0]['status'] == 'Approved', 'admin review approval')
        check(result['data']['tasks'][0]['status'] == 'open' and len(result['data']['leads']) == 2, 'hide leaves customer/task intact')
        restored = {'type': 'alerts.restore', 'id': result['data']['governance']['alerts'][0]['id'], 'reason': 'Customer needs attention again'}
        check(control('Member', restored)[0] == 403, 'member cannot restore')
        check(control('Owner', restored)[0] == 200, 'owner restore')
        before = store.read()
        bad = copy.deepcopy(before['data']); bad['governance']['audit'] = []
        try:
            store.save(bad, before['revision'], governance_command=True)
            check(False, 'direct protected audit removal must fail')
        except ValueError as error:
            check('append-only' in str(error), 'governance audit append-only even trusted internal save')
        check(store.read() == before, 'audit denial rolls back')
        good = copy.deepcopy(before['data']); good['leads'][0]['notes'].append('Legitimate general edit')
        check(request('Owner', 'PUT', payload={'revision': before['revision'], 'data': good})[0] == 200, 'owner normal writes preserve controls')
        reopened = m.Store(store.path)
        check(reopened.read() == store.read(), 'governance survives SQLite reopen')
        with store.connect() as db:
            check(db.execute('SELECT COUNT(*) FROM governance_audit').fetchone()[0] == len(store.read()['data']['governance']['audit']), 'durable governance audit projection')
        for headers in [{'X-Pulse-CSRF': 'bad'}, {'Origin': 'https://evil.invalid'}, {'Sec-Fetch-Site': 'cross-site'}]:
            check(request('Owner', 'POST', 'control', {'revision': 0, 'command': add}, headers)[0] == 403, 'same-origin command enforcement')
        check(request('Owner', 'POST', 'control', [], None)[0] == 400, 'malformed command body rejected')
        check(control('Owner', {'type': 'connections.sync', 'id': identity})[0] == 400, 'no invented sync command')
        empty = m.Store(Path(temp) / 'empty.sqlite3')
        forged = fixture(); forged['governance'] = store.read()['data']['governance']
        try:
            empty.save(forged, 0)
            check(False, 'fresh import cannot forge protected controls')
        except ValueError:
            check(empty.read()['revision'] == 0, 'initial generic PUT cannot seed privileged governance')
    finally:
        for httpd in servers: httpd.shutdown(); httpd.server_close()
print('PASS:', checks, 'protected governance / trusted sample role / CAS / HTTP checks.')
