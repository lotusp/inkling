import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspect } from './check.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const root=mkdtempSync(join(tmpdir(),'inkling-openspec-smoke-'));
const change='save-article';
const dir=join(root,'openspec/changes',change);
const env={...process.env,OPENSPEC_TELEMETRY:'0',OPENSPEC_NO_UPDATE_CHECK:'1'};
function run(...args) {
  const result=spawnSync('openspec',args,{cwd:root,env,encoding:'utf8',timeout:30000});
  if(result.error||result.status!==0) throw new Error(`openspec ${args.join(' ')} failed: ${result.error||result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function write(path,text) {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
try {
  mkdirSync(join(root,'openspec'),{recursive:true});
  cpSync(join(repo,'openspec/config.yaml'),join(root,'openspec/config.yaml'));
  cpSync(join(repo,'openspec/schemas'),join(root,'openspec/schemas'),{recursive:true});
  console.log(`OpenSpec ${run('--version').trim()}`);
  run('schema','validate','inkling-atdd');
  run('new','change',change,'--schema','inkling-atdd');
  const before=JSON.parse(run('status','--change',change,'--json'));
  assert.equal(before.isComplete,false);
  const spec='# Article persistence delta\n\n## Purpose\n\nThis fixture verifies that the local writing workspace can preserve an article and that archive transfers the complete behavior contract into its living specification.\n\n## ADDED Requirements\n\n### Requirement: Preserve article text\nThe system SHALL preserve saved article text for a later read.\n\n#### Scenario: ARTICLE-SAVE-001 Read saved article\n- **WHEN** the author saves an article and reads it again\n- **THEN** the stored text equals the saved text\n';
  write(join(dir,'proposal.md'),'# Proposal\n\n## Why\nVerify the Harness archive workflow.\n\n## What Changes\nAdd the article persistence fixture.\n\n## Capabilities\n### New Capabilities\n- `article`: preserve saved text.\n### Modified Capabilities\nNone.\n\n## Impact\nTemporary fixture only.\n');
  write(join(dir,'specs/article/spec.md'),spec);
  write(join(dir,'design.md'),'# Design\nExercise the OpenSpec schema in an isolated temporary workspace.\n');
  write(join(dir,'acceptance.md'),'# Acceptance\n| ID | Entry | Assertion |\n| --- | --- | --- |\n| ARTICLE-SAVE-001 | OpenSpec archive | Living Spec preserves requirement and scenario |\n');
  write(join(dir,'tasks.md'),'# Tasks\n- [x] 1.1 Verify the isolated archive fixture.\n');
  assert.deepEqual(inspect({root,change,stage:'plan'}),[]);
  const apply=JSON.parse(run('instructions','apply','--change',change,'--json'));
  assert.notEqual(apply.state,'blocked');
  run('validate',change,'--strict','--no-interactive');
  write(join(dir,'verification.md'),'# Verification\nThe fixture checks schema resolution, apply readiness, strict validation and archive content.\n');
  write(join(dir,'evidence/check.log'),'Isolated fixture evidence for exercising the artifact validator, not a product test claim.\n');
  write(join(dir,'evidence.json'),JSON.stringify({schemaVersion:1,changeId:change,result:'passed',subject:[{path:'@change/specs/article/spec.md',sha256:createHash('sha256').update(spec).digest('hex')}],checks:[{id:'fixture',command:'OpenSpec fixture validation',status:'passed',exitCode:0,log:'evidence/check.log'}],scenarios:[{id:'ARTICLE-SAVE-001',status:'passed',checkIds:['fixture']}]}));
  assert.deepEqual(inspect({root,change,stage:'verify'}),[]);
  run('archive',change,'--yes');
  const archived=readdirSync(join(root,'openspec/changes/archive')).find(x=>x.endsWith('-'+change));
  assert.ok(archived);
  assert.deepEqual(inspect({root,change:archived,stage:'archived'}),[]);
  run('validate','--specs','--strict','--no-interactive');
  run('validate','--archived','--strict','--no-interactive');
  const living=readFileSync(join(root,'openspec/specs/article/spec.md'),'utf8');
  assert.match(living,/### Requirement: Preserve article text/);
  assert.match(living,/#### Scenario: ARTICLE-SAVE-001/);
  assert.match(living,/This fixture verifies/);
  console.log('PASS: schema → plan → apply readiness → strict validate → archive → Living Spec, using isolated fixtures only.');
} finally {rmSync(root,{recursive:true,force:true});}
