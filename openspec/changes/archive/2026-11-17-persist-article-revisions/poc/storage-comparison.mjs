// Isolated design experiment, not the product repository implementation.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Database = require(process.env.INKLING_POC_DRIVER);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code) { throw Object.assign(new Error(code), {code}); }
function checkpoint(point, fault) {
  if (fault === point) process.kill(process.pid, 'SIGKILL');
  if (fault === `error:${point}`) fail('ENOSPC');
}
function syncDir(dir) { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function atomic(dir, name, data) {
  const target = join(dir, name), temp = `${target}.${process.pid}.tmp`;
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, target); syncDir(dir);
}
function fileStore(dir) {
  fs.mkdirSync(dir, {recursive:true});
  const path = join(dir, 'manifest.json');
  if (!fs.existsSync(path)) atomic(dir, 'manifest.json', {head:0, revisions:{}, mutations:{}});
  const load = () => JSON.parse(fs.readFileSync(path, 'utf8'));
  return {
    save(request, fault) {
      const state = load(), requestHash=hash(request), previous=state.mutations[request.id];
      if(previous) { if(previous.requestHash!==requestHash) fail('IDEMPOTENCY_MISMATCH'); return previous.revision; }
      if(request.base!==state.head) fail('REVISION_CONFLICT');
      const revision=state.head+1;
      atomic(dir, `revision-${revision}.json`, request.content);
      checkpoint('before-commit',fault);
      state.revisions[revision] = {hash:hash(request.content)};
      state.mutations[request.id] = {requestHash,revision}; state.head=revision;
      atomic(dir,'manifest.json',state);
      checkpoint('after-commit',fault); return revision;
    },
    read() { const s=load(); if(!s.head) return {head:0,count:0}; const content=JSON.parse(fs.readFileSync(join(dir,`revision-${s.head}.json`),'utf8')); if(hash(content)!==s.revisions[s.head].hash) fail('CORRUPT'); return {head:s.head,count:Object.keys(s.revisions).length,content}; },
    close() {}
  };
}
function sqliteStore(dir) {
  fs.mkdirSync(dir,{recursive:true});
  const db=new Database(join(dir,'inkling.sqlite'),{timeout:100});
  db.pragma('locking_mode = EXCLUSIVE'); db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL'); db.pragma('fullfsync = ON'); db.pragma('foreign_keys = ON');
  db.exec('BEGIN EXCLUSIVE; COMMIT;');
  db.exec(`CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY, content TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, head INTEGER REFERENCES revisions(id));
    INSERT OR IGNORE INTO articles VALUES(1,NULL);
    CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, revision INTEGER NOT NULL REFERENCES revisions(id));`);
  return {
    save(request,fault) {
      return db.transaction(()=>{
        const requestHash=hash(request), previous=db.prepare('SELECT * FROM mutations WHERE id=?').get(request.id);
        if(previous) { if(previous.request_hash!==requestHash) fail('IDEMPOTENCY_MISMATCH'); return previous.revision; }
        const head=db.prepare('SELECT COALESCE(head,0) head FROM articles WHERE id=1').get().head;
        if(request.base!==head) fail('REVISION_CONFLICT');
        const revision=head+1;
        db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(revision,JSON.stringify(request.content),hash(request.content));
        db.prepare('UPDATE articles SET head=? WHERE id=1').run(revision);
        db.prepare('INSERT INTO mutations VALUES(?,?,?)').run(request.id,requestHash,revision);
        checkpoint('before-commit',fault); return revision;
      }).immediate();
    },
    read() { const row=db.prepare('SELECT id,content,hash FROM revisions WHERE id=(SELECT head FROM articles WHERE id=1)').get(); const count=db.prepare('SELECT COUNT(*) n FROM revisions').get().n; if(!row)return {head:0,count}; const content=JSON.parse(row.content);if(hash(content)!==row.hash)fail('CORRUPT');return {head:row.id,count,content}; },
    close(){db.close();},
    db
  };
}
const open=(kind,dir)=>kind==='files'?fileStore(dir):sqliteStore(dir);
const content={schemaVersion:1,title:'保存实验',doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'中文稿件与幂等保存'}]}]}};
const request={id:'mutation-a',base:0,content};
if(process.argv[2]==='child') {
  const [kind,dir,fault]=process.argv.slice(3),store=open(kind,dir);
  store.save(request,fault); // SQLite commit is complete when save returns.
  if(kind==='sqlite')checkpoint('after-commit',fault);
  store.close();process.exit(0);
}
let checks=0;
function passed(kind,name) {checks++;console.log(`PASS ${kind}: ${name}`);}
const root=fs.mkdtempSync(join(tmpdir(),'inkling-storage-'));
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,driver:require(join(process.env.INKLING_POC_DRIVER,'package.json')).version}));
try {
 for(const kind of ['files','sqlite']) {
  const dir=join(root,kind);let store=open(kind,dir);
  if(kind==='sqlite')console.log(JSON.stringify({sqlite:store.db.prepare('SELECT sqlite_version() version').get().version,pragmas:Object.fromEntries(['journal_mode','synchronous','fullfsync','locking_mode','foreign_keys'].map(p=>[p,store.db.pragma(p,{simple:true})]))}));
  assert.equal(store.save(request),1);store.close();store=open(kind,dir);
  assert.deepEqual(store.read(),{head:1,count:1,content});passed(kind,'reopen preserves content and head');
  assert.equal(store.save(request),1);assert.equal(store.read().count,1);passed(kind,'same mutation returns original result');
  assert.throws(()=>store.save({...request,content:{...content,title:'different'}}),/IDEMPOTENCY_MISMATCH/);passed(kind,'same key different payload rejected');
  assert.throws(()=>store.save({...request,id:'stale-tab'}),/REVISION_CONFLICT/);assert.equal(store.read().head,1);passed(kind,'stale tab cannot overwrite');
  assert.throws(()=>store.save({...request,id:'write-failure',base:1},'error:before-commit'),/ENOSPC/);store.close();store=open(kind,dir);assert.equal(store.read().head,1);assert.equal(store.read().count,1);passed(kind,'injected precommit write failure leaves prior head');store.close();
  for(const point of ['before-commit','after-commit']) {
   const crashDir=join(root,`${kind}-${point}`);open(kind,crashDir).close();
   const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'child',kind,crashDir,point],{encoding:'utf8',env:process.env,timeout:10000});
   assert.equal(child.signal,'SIGKILL',child.stderr);store=open(kind,crashDir);
   assert.equal(store.read().head,point==='before-commit'?0:1);
   assert.equal(store.save(request),1);assert.equal(store.read().count,1);assert.deepEqual(store.read().content,content);store.close();passed(kind,`SIGKILL ${point}, reopen and retry consistent`);
  }
  const damaged=join(root,`${kind}-corrupt`);store=open(kind,damaged);store.save(request);store.close();
  if(kind==='files')fs.writeFileSync(join(damaged,'revision-1.json'),'{}');
  else {const db=new Database(join(damaged,'inkling.sqlite'));db.prepare('UPDATE revisions SET content=?').run('{}');db.close();}
  store=open(kind,damaged);assert.throws(()=>store.read(),/CORRUPT/);store.close();passed(kind,'content hash detects tampering without auto overwrite');
 }
 const lockDir=join(root,'sqlite-lock');const holder=open('sqlite',lockDir);
 const locked=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'child','sqlite',lockDir,'none'],{encoding:'utf8',env:process.env,timeout:10000});
 assert.notEqual(locked.status,0);assert.match(locked.stderr,/SQLITE_BUSY|database is locked/);holder.close();open('sqlite',lockDir).close();passed('sqlite','second process rejected, lock released on close');
 const bench=[];
 for(const kind of ['files','sqlite']) {
  const store=open(kind,join(root,`${kind}-timing`)),times=[];
  for(let i=0;i<30;i++){const start=performance.now();store.save({id:`bench-${i}`,base:i,content:{...content,title:`sample ${i}`,padding:'技术写作。'.repeat(4000)}});times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);bench.push({kind,saves:30,payloadBytes:Buffer.byteLength(JSON.stringify({...content,padding:'技术写作。'.repeat(4000)})),medianMs:+times[15].toFixed(2),p95Ms:+times[28].toFixed(2)});store.close();
 }
 console.log(JSON.stringify({smokeTiming:bench,note:'Small local sample; not a comparative performance benchmark or power-loss proof.'}));
 console.log(`RESULT ${checks} checks passed`);
} finally {fs.rmSync(root,{recursive:true,force:true});}
