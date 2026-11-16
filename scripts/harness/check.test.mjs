import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inspect } from './check.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'inkling-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, text) { const p=join(root,path); mkdirSync(dirname(p),{recursive:true}); writeFileSync(p,text); }
  const change='openspec/changes/save-article';
  const spec='## ADDED Requirements\n\n### Requirement: Save\nThe app SHALL save.\n\n#### Scenario: ARTICLE-SAVE-001 Save text\n- **WHEN** saving\n- **THEN** text persists\n';
  for (const file of ['proposal.md','design.md']) write(`${change}/${file}`, '# Design\nA real scope, decision, and boundary for this change.\n');
  write(`${change}/.openspec.yaml`, 'schema: inkling-atdd\n');
  write(`${change}/specs/article/spec.md`,spec);
  write(`${change}/acceptance.md`,'# Acceptance\n| ID | Entry | Assertion |\n| --- | --- | --- |\n| ARTICLE-SAVE-001 | API | persisted text |\n');
  write(`${change}/tasks.md`,'# Tasks\n- [x] 1.1 ARTICLE-SAVE-001 save and verify.\n');
  write(`${change}/verification.md`,'# Verification\nTests executed against the specified inputs; reviewed the relevant diff.\n');
  write(`${change}/evidence/acceptance.log`,'ARTICLE-SAVE-001 passed; command exit 0.\n');
  write('src/save.mjs','export const save = value => value;\n');
  const hash=p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex');
  const evidence={schemaVersion:1,changeId:'save-article',result:'passed',subject:[
    {path:'@change/specs/article/spec.md',sha256:hash(`${change}/specs/article/spec.md`)},
    {path:'src/save.mjs',sha256:hash('src/save.mjs')}
  ],checks:[{id:'acceptance',command:'node acceptance.test.mjs',status:'passed',exitCode:0,log:'evidence/acceptance.log'}],scenarios:[{id:'ARTICLE-SAVE-001',status:'passed',checkIds:['acceptance']}]};
  const saveEvidence=()=>write(`${change}/evidence.json`,JSON.stringify(evidence)); saveEvidence();
  return {root,write,change,evidence,saveEvidence};
}

test('HARNESS-001 blocks two active changes',t=>{const f=fixture(t);f.write('openspec/changes/second/proposal.md','second');assert.match(inspect({root:f.root}).join('\n'),/one active/i);});
test('HARNESS-002 blocks missing plan artifacts',t=>{const f=fixture(t);rmSync(join(f.root,f.change,'design.md'));assert.match(inspect({root:f.root,change:'save-article',stage:'plan'}).join('\n'),/design.md/);});
test('HARNESS-003 accepts mapped plan and valid evidence',t=>{const f=fixture(t);assert.deepEqual(inspect({root:f.root,change:'save-article',stage:'plan'}),[]);assert.deepEqual(inspect({root:f.root,change:'save-article',stage:'verify'}),[]);});
test('HARNESS-004 rejects stale code evidence',t=>{const f=fixture(t);f.write('src/save.mjs','changed');assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/hash|stale/i);});
test('HARNESS-005 rejects failed required check',t=>{const f=fixture(t);f.evidence.checks[0].exitCode=1;f.saveEvidence();assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/acceptance/);});
test('HARNESS-006 rejects missing scenario evidence',t=>{const f=fixture(t);f.evidence.scenarios=[];f.saveEvidence();assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/ARTICLE-SAVE-001/);});
test('HARNESS-007 rejects unfinished tasks',t=>{const f=fixture(t);f.write(`${f.change}/tasks.md`,'# Tasks\n- [ ] 1.1 unfinished\n');assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/unfinished/i);});
test('HARNESS-008 rejects outside evidence paths',t=>{const f=fixture(t);f.evidence.checks[0].log='../../../../etc/passwd';f.saveEvidence();assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/path|outside/i);});
test('HARNESS-009 fails unknown change and invalid stage',t=>{const f=fixture(t);assert.ok(inspect({root:f.root,change:'absent',stage:'plan'}).length);assert.ok(inspect({root:f.root,change:'save-article',stage:'typo'}).length);});
test('HARNESS-010 requires each delta in the evidence fingerprint',t=>{const f=fixture(t);f.evidence.subject=f.evidence.subject.filter(x=>!x.path.startsWith('@change/'));f.saveEvidence();assert.match(inspect({root:f.root,change:'save-article',stage:'verify'}).join('\n'),/specs\/article\/spec.md/);});
