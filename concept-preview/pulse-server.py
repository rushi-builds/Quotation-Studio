"""Opt-in, single isolated SAMPLE workspace. Never connects to production or providers.
Run: python3 concept-preview/pulse-server.py --db /home/user/studio-pulse-demo.sqlite3
Not production authentication: anyone with the preview URL can open this sample workspace.
"""
import argparse
import hashlib
import html
import json
import mimetypes
import secrets
import sqlite3
import subprocess
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent.parent
FIELDS = {'historyStart', 'leads', 'daily', 'posts', 'acquisition', 'tasks', 'threads', 'events', 'calendar', 'rules', 'connectionDrafts', 'ruleRuns', 'nextId', 'ops', 'governance'}
MAX_BODY = 3 * 1024 * 1024


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, path):
        path = Path(path).resolve()
        if path.is_relative_to(ROOT):
            raise ValueError('Keep the sample SQLite database outside the repository')
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        with self.connect() as db:
            db.executescript((ROOT / 'concept-preview/pulse-schema.sql').read_text())
        path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute('PRAGMA foreign_keys = ON')
        return db

    def read(self):
        with self.lock, self.connect() as db:
            row = db.execute('SELECT revision,payload FROM workspace WHERE id=1').fetchone()
            return {'revision': row[0], 'data': json.loads(row[1])} if row else {'revision': 0, 'data': None}

    def save(self, data, revision, *, governance_command=False):
        if type(revision) is not int or revision < 0: raise ValueError('Invalid revision')
        if not isinstance(data, dict) or not set(data).issubset(FIELDS):
            raise ValueError('Invalid workspace fields')
        def validate(value):
            if isinstance(value, dict):
                if any(key in {'__proto__', 'constructor', 'prototype'} for key in value):
                    raise ValueError('Unsafe object key')
                for item in value.values(): validate(item)
            elif isinstance(value, list):
                for item in value: validate(item)
        validate(data)
        for key in ('leads', 'tasks', 'threads', 'events', 'calendar', 'rules'):
            if not isinstance(data.get(key), list): raise ValueError('Missing record collection: ' + key)
            ids = [row.get('id') for row in data[key] if isinstance(row, dict)]
            if len(ids) != len(data[key]) or any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
                raise ValueError('Invalid / duplicate record identity')
        lead_ids = {lead['id'] for lead in data['leads']}
        for key in ('tasks', 'threads', 'events', 'calendar'):
            if any(row.get('leadId') not in lead_ids for row in data[key]): raise ValueError('Orphaned customer link')
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False)
        if len(payload.encode()) > MAX_BODY: raise ValueError('Workspace too large')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT revision,payload FROM workspace WHERE id=1').fetchone()
            if revision != (current[0] if current else 0): raise Conflict('Workspace changed in another tab or local worker; reload to review latest revision')
            previous_data = json.loads(current[1]) if current else {}
            empty_governance = {'connections': [], 'alerts': [], 'requests': [], 'audit': [], 'nextId': 1}
            if not governance_command and data.get('governance', empty_governance) != previous_data.get('governance', empty_governance):
                raise ValueError('Governance is protected; use the role-checked command endpoint')
            gov_audit = data.get('governance', empty_governance)['audit']
            identities = [row['id'] for row in gov_audit]
            if len(identities) != len(set(identities)): raise ValueError('Duplicate governance audit identity')
            incoming_governance_audit = {row['id']: json.dumps(row, sort_keys=True) for row in gov_audit}
            for identity, previous in db.execute('SELECT id,payload FROM governance_audit'):
                if incoming_governance_audit.get(identity) != json.dumps(json.loads(previous), sort_keys=True):
                    raise ValueError('Governance history is append-only')
            incoming_audit = {row['id']: json.dumps(row, sort_keys=True) for row in data.get('ops', {}).get('audit', [])}
            for identity, previous in db.execute('SELECT id,payload FROM control_audit'):
                if incoming_audit.get(identity) != json.dumps(json.loads(previous), sort_keys=True):
                    raise ValueError('Existing control history is append-only')
            for table in ('outbox', 'linked_records', 'opportunities', 'contacts', 'organisations'):
                db.execute('DELETE FROM ' + table)
            for lead in data['leads']:
                name = str(lead.get('company', '')).replace(' · Sample', '').strip()
                if not name: raise ValueError('Company / customer name required')
                org = 'org-' + hashlib.sha256(name.casefold().encode()).hexdigest()[:24]
                db.execute('INSERT OR IGNORE INTO organisations VALUES (?,?)', (org, name.casefold()))
                contact = 'contact-' + lead['id']
                db.execute('INSERT INTO contacts VALUES (?,?,?)', (contact, org, json.dumps({key: lead.get(key) for key in ('name', 'email', 'phone')})))
                db.execute('INSERT INTO opportunities VALUES (?,?,?,?)', (lead['id'], org, contact, json.dumps(lead)))
            for key, kind in (('tasks', 'task'), ('threads', 'thread'), ('calendar', 'meeting'), ('events', 'activity')):
                for row in data[key]: db.execute('INSERT INTO linked_records VALUES (?,?,?,?)', (kind, row['id'], row['leadId'], json.dumps(row)))
            for row in data.get('ops', {}).get('jobs', []):
                db.execute('INSERT INTO outbox VALUES (?,?,?,?,?,?)', (row['id'], row['key'], row['leadId'], row['channel'], row['status'], json.dumps(row)))
            for row in data.get('ops', {}).get('audit', []): db.execute('INSERT OR IGNORE INTO control_audit VALUES (?,?)', (row['id'], json.dumps(row)))
            for row in gov_audit: db.execute('INSERT OR IGNORE INTO governance_audit VALUES (?,?)', (row['id'], json.dumps(row)))
            revision += 1
            db.execute('INSERT INTO workspace(id,revision,payload) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP', (revision, payload))
            return {'revision': revision}

    def control(self, command, revision, actor):
        if type(revision) is not int or revision < 0: raise ValueError('Invalid revision')
        if actor['role'] not in ('Owner', 'Admin') and (actor['role'] != 'Member' or command.get('type') not in ('alerts.snooze', 'alerts.request')):
            raise PermissionError('Owner / Admin access required for this control')
        with self.lock:
            current = self.read()
            if current['revision'] != revision: raise Conflict('Workspace changed; reload before reviewing this control')
            if current['data'] is None: raise ValueError('Initialise the sample workspace before managing controls')
            result = subprocess.run(['node', str(ROOT / 'concept-preview/pulse-control.cjs')], input=json.dumps({'data': current['data'], 'command': command, 'actor': actor}), text=True, capture_output=True, timeout=15, check=True)
            result = json.loads(result.stdout)
            if 'error' in result: raise ValueError(result['error'])
            saved = self.save(result['data'], revision, governance_command=True)
            return {**saved, 'data': result['data'], 'actor': actor}

    def tick(self, now=None):
        with self.lock:
            current = self.read()
            if current['data'] is None: return False
            result = subprocess.run(['node', str(ROOT / 'concept-preview/pulse-worker.cjs')], input=json.dumps({'data': current['data'], 'now': now}), text=True, capture_output=True, timeout=15, check=True)
            result = json.loads(result.stdout)
            if result['changed']: self.save(result['data'], current['revision'])
            return result['changed']


def restore_backup(store, path):
    from datetime import datetime, timezone
    path = Path(path)
    if path.stat().st_size > MAX_BODY: raise ValueError('Backup too large')
    payload = json.loads(path.read_text())
    if payload.get('format') != 'studio-pulse-sample' or payload.get('version') != 1: raise ValueError('Not a supported sample backup')
    if store.read()['revision'] != 0: raise ValueError('Restore only into a new empty isolated database')
    data = payload['data']
    for rule in data.get('rules', []):
        rule['status'] = 'Draft'
        for key in ('approval', 'approvedAt', 'approvedBy'): rule.pop(key, None)
    ops = data.setdefault('ops', {'jobs': [], 'audit': [], 'nextId': 1, 'quiet': {'start': 9, 'end': 18}})
    for job in ops.get('jobs', []):
        if job.get('status') not in ('Done', 'Cancelled'):
            job['status'] = 'Cancelled'; job['approval'] = False; job['reason'] = 'Backup restored; fresh draft and review required'
    ops.setdefault('audit', []).insert(0, {'id': 'restore-' + secrets.token_hex(8), 'type': 'Sample backup restored', 'detail': 'Rules reset to Draft; pending actions cancelled. No provider delivery.', 'at': datetime.now(timezone.utc).isoformat(), 'actor': 'Local sample import, not authenticated production user'})
    return store.save(data, 0, governance_command=True)


def server(store, port=8090, scheduler=False, role='Owner', actor_name='Local sample operator', owner_name='Sales'):
    if role not in ('Owner', 'Admin', 'Member', 'Viewer'): raise ValueError('Invalid sample role')
    actor = {'id': 'local-sample-' + role.lower(), 'name': actor_name, 'role': role, 'ownerName': owner_name}
    csrf = secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def respond(self, code, body, content_type='application/json'):
            if isinstance(body, dict): body = json.dumps(body).encode()
            elif isinstance(body, str): body = body.encode()
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers(); self.wfile.write(body)

        def authorised(self):
            host = self.headers.get('Host', '')
            origin = self.headers.get('Origin')
            return self.headers.get('X-Pulse-CSRF') == csrf and self.headers.get('Sec-Fetch-Site') != 'cross-site' and (not origin or origin in ('http://' + host, 'https://' + host))

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path == '/concept-preview/pulse-api/workspace':
                if not self.authorised(): return self.respond(403, {'error': 'Local workspace session / same-origin check failed'})
                return self.respond(200, {**store.read(), 'scheduler': scheduler, 'externalSending': False, 'actor': actor})
            if path.startswith('/api/') or '/pulse-api/' in path: return self.respond(403, {'error': 'No production or provider API access'})
            if path == '/': path = '/concept-preview/dashboard.html'
            file = (ROOT / path.lstrip('/')).resolve()
            allowed = file.is_relative_to(ROOT) and not any(part.startswith('.') for part in Path(path).parts) and path.startswith(('/assets/', '/concept-preview/'))
            if not allowed or not file.is_file() or file.suffix.lower() not in {'.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'}:
                return self.respond(404, {'error': 'Not found'})
            body = file.read_bytes()
            if file == ROOT / 'concept-preview/dashboard.html':
                # Explicit opt-in local mode only. The checked-in static CSP and sandbox are untouched.
                body = body.decode().replace("connect-src 'none'", "connect-src 'self'").replace('<meta charset="UTF-8"', '<meta name="pulse-access-role" content="' + html.escape(role, quote=True) + '"><meta name="pulse-local-csrf" content="' + csrf + '"><meta charset="UTF-8"')
                body = body.replace('Sample workspace · no login needed · no live data', 'Persistent SAMPLE workspace · local SQLite · no live accounts')
            return self.respond(200, body, mimetypes.guess_type(file)[0] or 'application/octet-stream')

        def do_PUT(self):
            if urlsplit(self.path).path != '/concept-preview/pulse-api/workspace': return self.respond(404, {'error': 'Not found'})
            if not self.authorised(): return self.respond(403, {'error': 'Local workspace session / same-origin check failed'})
            if self.headers.get('Content-Type') != 'application/json': return self.respond(415, {'error': 'JSON required'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= MAX_BODY: return self.respond(413, {'error': 'Workspace size limit'})
                payload = json.loads(self.rfile.read(size))
                if role not in ('Owner', 'Admin'): return self.respond(403, {'error': 'Owner / Admin required for general sample workspace edits'})
                result = store.save(payload['data'], payload['revision'])
                return self.respond(200, result)
            except Conflict as error: return self.respond(409, {'error': str(error)})
            except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error: return self.respond(400, {'error': str(error)})

        def do_POST(self):
            if urlsplit(self.path).path != '/concept-preview/pulse-api/control': return self.respond(405, {'error': 'Method not allowed'})
            if not self.authorised(): return self.respond(403, {'error': 'Local workspace session / same-origin check failed'})
            if self.headers.get('Content-Type') != 'application/json': return self.respond(415, {'error': 'JSON required'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 65536: return self.respond(413, {'error': 'Control size limit'})
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict) or set(payload) != {'revision', 'command'} or not isinstance(payload['command'], dict):
                    raise ValueError('Only revision and command accepted; actor/role is server-controlled')
                result = store.control(payload['command'], payload['revision'], actor)
                return self.respond(200, result)
            except PermissionError as error: return self.respond(403, {'error': str(error)})
            except Conflict as error: return self.respond(409, {'error': str(error)})
            except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error: return self.respond(400, {'error': str(error)})
            except (subprocess.SubprocessError, OSError): return self.respond(503, {'error': 'Control engine unavailable; no changes saved'})
        def do_OPTIONS(self): self.respond(403, {'error': 'Cross-origin access disabled'})

    httpd = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    if scheduler:
        def loop():
            while not stop.wait(15):
                try: store.tick()
                except Exception as error: print('Internal worker skipped; database retained:', type(error).__name__, flush=True)
        stop = threading.Event()
        threading.Thread(target=loop, daemon=True).start()
    return httpd


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--port', type=int, default=8090)
    parser.add_argument('--restore', help='Restore a sample JSON backup into a NEW isolated database; cancels pending actions and resets rules')
    parser.add_argument('--scheduler', action='store_true', help='Run eligible INTERNAL actions every 15 seconds; no external delivery')
    parser.add_argument('--role', choices=['Owner', 'Admin', 'Member', 'Viewer'], default='Owner', help='Fixed role for EVERY visitor to this anonymous SAMPLE server; not authentication')
    parser.add_argument('--actor-name', default='Local sample operator')
    parser.add_argument('--owner-name', default='Sales', help='Assigned owner name for the sample Member role')
    args = parser.parse_args()
    store = Store(args.db)
    if args.restore: restore_backup(store, args.restore)
    httpd = server(store, args.port, args.scheduler, args.role, args.actor_name, args.owner_name)
    print('Studio Pulse isolated SAMPLE workspace listening on 0.0.0.0:' + str(args.port) + '; external sending disabled', flush=True)
    httpd.serve_forever()
