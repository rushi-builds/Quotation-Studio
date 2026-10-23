/* Both adapters use compare-and-swap, so competing approvals never silently
 * overwrite each other. This app currently has one workspace per database;
 * no client-supplied workspace/tenant ID can select another company's store. */
import { emptyAccess } from './workspace-access.mjs';
export function localAccessStore(load,save,actorOf,readers){
  return {
    async load(){return structuredClone(load().workspaceAccess||emptyAccess());},
    async save(state,expected){
      const latest=load();
      if((latest.workspaceAccess?.revision||0)!==expected)return false;
      latest.workspaceAccess=structuredClone(state);save(latest);return true;
    },
    async user(id){return load().users.find(u=>u.id===id)||null;},
    async actor(id){const u=load().users.find(u=>u.id===id);return u?actorOf(u):null;},
    async users(){return load().users;},
    ...readers
  };
}
export function d1AccessStore(db,actorOf,readers){
  const one=(sql,...v)=>db.prepare(sql).bind(...v).first();
  return {
    async load(){
      const row=await one("SELECT revision,payload FROM workspace_access WHERE id = 'workspace'");
      return row?{...JSON.parse(row.payload),revision:row.revision}:emptyAccess();
    },
    async save(state,expected){
      const row=await one(`INSERT INTO workspace_access (id,revision,payload) VALUES ('workspace',?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload
        WHERE workspace_access.revision = ? RETURNING revision`,state.revision,JSON.stringify(state),expected);
      return Boolean(row&&row.revision===state.revision);
    },
    async user(id){return one('SELECT * FROM users WHERE id = ?',id);},
    async actor(id){const u=await one('SELECT * FROM users WHERE id = ?',id);return u?actorOf(u):null;},
    async users(){const rows=await db.prepare('SELECT id,name FROM users ORDER BY name LIMIT 1000').all();return rows.results;},
    ...readers
  };
}
export function companyMetrics(proposals,tasks){
  // No customer names, owner identities, free text, prices or form snapshots.
  const open=tasks.filter(t=>t.status==='open'),now=Date.now();
  return {quotations:proposals.length,accepted:proposals.filter(p=>p.status==='accepted').length,openFollowups:open.length,overdueFollowups:open.filter(t=>t.due_at&&Date.parse(t.due_at)<now).length};
}
export function quotedFinance(proposals,valueOf){
  let sum=0,known=0,missing=0;
  for(const p of proposals){const v=valueOf(p);if(Number.isFinite(v)){sum+=v;known++;}else missing++;}
  return {currency:'INR',quotedSum:sum,proposalsWithValue:known,proposalsMissingValue:missing,note:'Recorded quotation value, not revenue, profit or money collected. Payment and payroll data are not connected.'};
}
