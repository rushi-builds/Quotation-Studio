"""Build a self-contained, explicitly offline visual preview. No deployment."""
from pathlib import Path
import re, base64, mimetypes
root = Path(__file__).resolve().parents[2]
src = root / 'review/dashboard'
html = (src / 'dashboard.html').read_text()
css = (src / 'dashboard.css').read_text()
def data(p):
    return 'data:' + (mimetypes.guess_type(p.name)[0] or 'application/octet-stream') + ';base64,' + base64.b64encode(p.read_bytes()).decode()
def asset_url(m):
    p = (root / 'assets/css' / m.group(1).strip("'\"")).resolve()
    return 'url("' + data(p) + '")' if p.is_file() else m.group(0)
css = re.sub(r'url\(([^)]+)\)', asset_url, css)
html = re.sub(r'<link rel="stylesheet"[^>]+>', lambda _: '<style>' + css + '</style>', html)
html = re.sub(r'(?:src|href)="(assets/images/[^\"]+)"', lambda m: m.group(0).replace(m.group(1), data(root / m.group(1))), html)
html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
html = html.replace('id="authScreen" class="splash"', 'id="authScreen" class="splash" style="display:none"').replace('id="dash" class="dash"', 'id="dash" class="dash on"')
html = html.replace('<div id="banner" class="banner" role="status"></div>', '<div id="banner" class="banner on info" role="status">Design preview · No live data</div>')
html = html.replace('<h1 id="homeGreeting">Dashboard</h1>', '<h1 id="homeGreeting">Good morning, Rushi</h1>').replace('<strong id="userName">—</strong>', '<strong id="userName">Rushi (Preview)</strong>').replace('<span id="userEmail">—</span>', '<span id="userEmail">Offline design preview</span>')
shim = '''
const note=()=>{const e=document.getElementById('toast');e.textContent='Visual preview only — this action needs the connected application.';e.classList.add('on');setTimeout(()=>e.classList.remove('on'),2800)};
window.PlatformAPI={listTasks:async()=>({tasks:[]}),listActivity:async()=>({activity:[]}),listNotifications:async()=>({notifications:[],unread:0}),reportSummary:async()=>({value:{quotedSum:0,proposalsWithValue:0}}),markAllNotificationsRead:async()=>{},updateTask:async()=>{}};
function show(name){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id==='panel-'+name));document.querySelectorAll('.nav-item').forEach(p=>p.classList.toggle('on',p.dataset.panel===name));const d=document.querySelector('.nav-item.on')?.closest('details');if(d)d.open=true;}
window.QSDash={proposals:()=>[],user:()=>({name:'Rushi (Preview)',role:'owner',roleLabel:'Owner'}),show,showTasks:(f)=>{document.getElementById('taskFilter').value=f;show('tasks')},open:note,toast:note,filterStatus:s=>{document.getElementById('filterStatus').value=s;show('proposals')},refresh:async()=>window.QSDashHome.refresh()};
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>show(b.dataset.panel));
document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){e.preventDefault();note()}if(e.target.closest('#btnNewFromHome,#btnNewProposal,#btnLogout,#btnLogout2,#btnTaskAdd,#btnGalleryUpload,#btnPublish,#btnSendPrepare,#btnSaveProfile,#btnChangePassword,#btnReportRefresh'))note()});
'''
html = html.replace('</body>', '<script>' + shim + '</script><script>' + (src / 'dashboard-home.js').read_text() + '</script><script>' + (src / 'dashboard-ui.js').read_text() + '</script><script>window.QSDashHome.refresh();</script></body>')
output = root / 'review/preview/Dashboard-Preview.html'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(output)
