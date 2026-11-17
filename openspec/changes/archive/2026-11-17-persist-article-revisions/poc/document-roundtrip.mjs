import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const { getSchema } = require('@tiptap/react');
const StarterKit = require('@tiptap/starter-kit').default;
const schema = getSchema([StarterKit.configure({ heading: { levels: [2, 3] }, link: {openOnClick: false} })]);
const fixtures = [
 {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'中文、English 和 👩‍💻'}]}]},
 {type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'论点'}]},{type:'paragraph',content:[{type:'text',marks:[{type:'bold'}],text:'依据'}]}]},
 {type:'doc',content:[{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'第一项'}]}]}]},{type:'codeBlock',attrs:{language:'ts'},content:[{type:'text',text:'const n = 1;\nconsole.log(n);'}]}]}
];
for (const [index,fixture] of fixtures.entries()) {
 const node = schema.nodeFromJSON(fixture);node.check();
 const first=node.toJSON(),restored=schema.nodeFromJSON(JSON.parse(JSON.stringify(first)));restored.check();
 assert.deepEqual(restored.toJSON(),first);assert.equal(restored.textContent,node.textContent);
 console.log(`PASS canonical JSON roundtrip fixture ${index+1}`);
}
assert.throws(()=>schema.nodeFromJSON({type:'doc',content:[{type:'unknown_future_node'}]}));
console.log('PASS unknown node rejected; attributes still require strict application validation');
console.log('RESULT 4 checks passed; schema-level only, no DOM/IME or product persistence verification');
