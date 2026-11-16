import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const validName = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const inside = (base, path) => { const rel=relative(base,path); return rel!== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep); };
const plainMarkdown = text => text.replace(/```[\s\S]*?```/g,'').replace(/<!--[\s\S]*?-->/g,'');

// Checks artifact structure and supplied evidence, never asserts test quality or Git merge completion.
export function inspect({root=process.cwd(),change,stage='plan'}={}) {
  const errors=[];
  if (!['plan','verify','archived'].includes(stage)) return [`Unknown stage: ${stage}`];
  root=resolve(root);
  if (!existsSync(root)) return [`Missing root: ${root}`];
  root=realpathSync(root);
  const changes=join(root,'openspec/changes');
  const active=existsSync(changes)?readdirSync(changes,{withFileTypes:true}).filter(x=>!x.name.startsWith('.')&&x.name!=='archive'&&(x.isDirectory()||x.isSymbolicLink())).map(x=>x.name):[];
  if (active.length>1) errors.push(`Only one active change is allowed: ${active.join(', ')}`);
  if (!change) {
    if (stage!=='plan') errors.push('A change name is required for verify or archived.');
    return errors;
  }
  if (!validName(change)) return [...errors,'Invalid change name; use kebab-case.'];
  if (stage==='archived' && active.length) errors.push(`Archived check requires zero active changes: ${active.join(', ')}`);
  const dir=join(changes,stage==='archived'?'archive':'',change);
  if (!existsSync(dir)) return [...errors,`Missing change directory: ${change}`];
  if (!inside(root,realpathSync(dir))) return [...errors,'Change path points outside repository.'];
  function file(base,path) {
    const full=resolve(base,path);
    if (!inside(base,full) || !inside(root,full)) throw new Error(`Invalid path outside allowed directory: ${path}`);
    if (!existsSync(full)||!statSync(full).isFile()) throw new Error(`Missing file: ${path}`);
    const real=realpathSync(full);
    if (!inside(base,real)||!inside(root,real)) throw new Error(`File path points outside allowed directory: ${path}`);
    return real;
  }
  function text(path,base=dir) {
    try { const value=readFileSync(file(base,path),'utf8'); if (!value.trim()) errors.push(`Empty file: ${path}`); return value; }
    catch(e) { errors.push(e.message); return ''; }
  }
  function files(path) {
    if (!existsSync(path)) return [];
    const result=[];
    for(const entry of readdirSync(path,{withFileTypes:true})) {
      const full=join(path,entry.name);
      if(entry.isSymbolicLink()) { errors.push(`Unsupported symlink in specs: ${full}`); continue; }
      if(entry.isDirectory()) result.push(...files(full));
      else if(entry.isFile()&&entry.name==='spec.md') result.push(full);
    }
    return result;
  }
  const metadata=text('.openspec.yaml');
  if(!/^schema:\s*inkling-atdd\s*$/m.test(metadata)) errors.push('Change must use schema: inkling-atdd.');
  for(const name of ['proposal.md','design.md']) text(name);
  const acceptance=plainMarkdown(text('acceptance.md'));
  const tasks=plainMarkdown(text('tasks.md'));
  const specFiles=files(join(dir,'specs'));
  if(!specFiles.length) errors.push('Missing delta specs; this checker handles behavior changes.');
  const scenarioIds=[];
  for(const path of specFiles) {
    const content=plainMarkdown(text(relative(dir,path)));
    for(const match of content.matchAll(/^#### Scenario:\s*(.+)$/gm)) {
      const id=match[1].match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\s|$)/)?.[1];
      if(!id) errors.push(`Scenario needs stable uppercase ID: ${match[1]}`);
      else scenarioIds.push(id);
    }
  }
  const acceptanceIds=[...acceptance.matchAll(/^\|\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s*\|/gm)].map(x=>x[1]);
  if(!acceptanceIds.length) errors.push('Acceptance table needs at least one scenario ID.');
  if(new Set(acceptanceIds).size!==acceptanceIds.length) errors.push('Duplicate acceptance scenario IDs.');
  if(new Set(scenarioIds).size!==scenarioIds.length) errors.push('Duplicate delta scenario IDs.');
  for(const id of scenarioIds) if(!acceptanceIds.includes(id)) errors.push(`Missing acceptance mapping: ${id}`);
  if(!/^- \[[ xX]\] /m.test(tasks)) errors.push('No implementation task checkboxes.');
  if(stage==='plan') return errors;
  if(/^- \[ \] /m.test(tasks)) errors.push('Unfinished implementation tasks.');
  text('verification.md');
  let evidence;
  try { evidence=JSON.parse(text('evidence.json')); } catch { return [...errors,'Invalid evidence.json']; }
  if(!evidence || typeof evidence!=='object') return [...errors,'evidence.json must be an object'];
  const changeId=stage==='archived'?change.replace(/^\d{4}-\d{2}-\d{2}-/,''):change;
  if(stage==='archived'&&!/^\d{4}-\d{2}-\d{2}-/.test(change)) errors.push('Archived change needs the OpenSpec date prefix.');
  if(evidence.schemaVersion!==1 || evidence.changeId!==changeId || evidence.result!=='passed') errors.push('Evidence must match the change, schemaVersion 1, and actual passed result.');
  const subjects=Array.isArray(evidence.subject)?evidence.subject:[];
  if(!subjects.length) errors.push('Missing evidence subject fingerprint.');
  const subjectPaths=new Set();
  for(const item of subjects) {
    try {
      if(typeof item?.path!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid subject path or sha256.');
      if(subjectPaths.has(item.path)) throw new Error(`Duplicate fingerprint path: ${item.path}`);
      subjectPaths.add(item.path);
      const base=item.path.startsWith('@change/')?dir:root;
      const name=item.path.startsWith('@change/')?item.path.slice(8):item.path;
      const p=file(base,name);
      if(p===join(dir,'evidence.json')) throw new Error('Evidence fingerprint cannot include itself.');
      const hash=createHash('sha256').update(readFileSync(p)).digest('hex');
      if(hash!==item.sha256) errors.push(`Stale evidence hash: ${item.path}`);
    } catch(e) { errors.push(e.message); }
  }
  for(const p of specFiles) {const name='@change/'+relative(dir,p).split(sep).join('/');if(!subjectPaths.has(name)) errors.push(`Missing delta fingerprint: ${name}`);}
  const checks=Array.isArray(evidence.checks)?evidence.checks:[];
  const checkIds=new Set();
  if(!checks.length) errors.push('No verification checks recorded.');
  for(const check of checks) {
    if(!check||typeof check.id!=='string'||!check.id.trim()||checkIds.has(check.id)) {errors.push('Invalid or duplicate check ID.');continue;}
    checkIds.add(check.id);
    if(check.status!=='passed'||check.exitCode!==0||typeof check.command!=='string'||!check.command.trim()) errors.push(`Check not passed or missing command: ${check.id}`);
    if(typeof check.log!=='string'||!check.log.startsWith('evidence/')) errors.push(`Invalid evidence log path: ${check.id}`);
    else text(check.log);
  }
  const rows=Array.isArray(evidence.scenarios)?evidence.scenarios:[];
  const covered=new Set();
  for(const row of rows) {
    if(!row||!acceptanceIds.includes(row.id)||covered.has(row.id)) {errors.push('Unknown or duplicate evidence scenario ID.');continue;}
    covered.add(row.id);
    if(row.status!=='passed'||!Array.isArray(row.checkIds)||!row.checkIds.length||row.checkIds.some(id=>!checkIds.has(id))) errors.push(`Invalid scenario evidence: ${row.id}`);
  }
  for(const id of acceptanceIds) if(!covered.has(id)) errors.push(`Missing scenario evidence: ${id}`);
  return errors;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const {values,positionals}=parseArgs({allowPositionals:true,options:{root:{type:'string'},stage:{type:'string',default:'plan'}}});
    if(positionals.length>1) throw new Error('Usage: node scripts/harness/check.mjs [change-id] [--stage plan|verify|archived] [--root path]');
    const errors=inspect({root:values.root,change:positionals[0],stage:values.stage});
    for(const error of errors) console.error(`FAIL: ${error}`);
    if(!errors.length) console.log(positionals.length?'Artifact structure checks passed. This does not prove test quality, spec semantics, or Git merge completion.':'Single-active-change structure check passed.');
    process.exitCode=errors.length?1:0;
  } catch(e) { console.error(e.message);process.exitCode=1; }
}
