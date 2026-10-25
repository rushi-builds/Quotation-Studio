/* Disposable D1-shaped adapter: bind() is immutable and batch() is atomic.
   No live account, workbook, database or service is contacted. */
export function memDb() {
  const rows = [], meta = new Map(), statements = [], batches = [];
  const users = {
    'owner-id': { id:'owner-id', email:'owner@example.test', name:'Owner', role:'owner' },
    'viewer-id': { id:'viewer-id', email:'viewer@example.test', name:'Viewer', role:'viewer' },
    'admin-id': { id:'admin-id', email:'elevated@example.test', name:'Elevated', role:'sales', is_admin:1 }
  };
  const sessions = Object.fromEntries(Object.keys(users).map(id=>[id.replace('-id','-token'),{user_id:id}]));
  const db = { rows, meta, statements, batches, failBatch:false,
    prepare(sql) {
      const make = (params=[]) => ({ sql, params,
        bind(...values) { return make(values); },
        async first() {
          statements.push({sql,params});
          if(sql.includes('FROM sessions'))return sessions[params[0]]||null;
          if(sql.includes('FROM users WHERE id'))return users[params[0]]||null;
          return null;
        },
        async all() {
          statements.push({sql,params});
          if(sql.includes('equipment_catalogue_meta'))return {results:[...meta].map(([key,value])=>({key,value}))};
          if(sql.includes('FROM equipment_catalogue'))return {results:[...rows].sort((a,b)=>a.kind.localeCompare(b.kind)||a.make.localeCompare(b.make)||a.model.localeCompare(b.model))};
          return {results:[]};
        },
        async run() {
          statements.push({sql,params});
          if(sql.includes('DELETE FROM equipment_catalogue'))rows.length=0;
          else if(sql.includes('INSERT INTO equipment_catalogue'))for(let i=0;i<params.length;i+=4)rows.push({kind:params[i],make:params[i+1],model:params[i+2],row_json:params[i+3]});
          else if(sql.includes('INSERT OR REPLACE INTO equipment_catalogue_meta'))meta.set(params[0],params[1]);
          return {success:true};
        }
      });
      return make();
    },
    async batch(items) {
      const oldRows=rows.slice(),oldMeta=[...meta];batches.push(items);
      try { for(const item of items) { await item.run();if(db.failBatch)throw new Error('Simulated D1 failure'); } }
      catch(error){ rows.splice(0,rows.length,...oldRows);meta.clear();for(const [k,v]of oldMeta)meta.set(k,v);throw error; }
      return items.map(()=>({success:true}));
    }
  };
  return db;
}
