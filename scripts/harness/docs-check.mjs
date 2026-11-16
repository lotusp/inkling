import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
function walk(dir) {
  if(!existsSync(dir))return [];
  return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(dir,x.name)):x.isFile()&&x.name.endsWith('.md')?[join(dir,x.name)]:[]);
}
const paths=['README.md','AGENTS.md'].map(p=>join(root,p)).filter(existsSync).concat(...['docs','openspec','.agents/skills'].map(p=>walk(join(root,p))));
const errors=[];
for(const path of paths) {
  const text=readFileSync(path,'utf8').replace(/```[\s\S]*?```/g,'');
  for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target=match[1].split('#')[0];
    if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('//')||target.includes('<'))continue;
    if(!existsSync(resolve(dirname(path),target)))errors.push(`${path}: broken local link ${target}`);
  }
}
for(const entry of readdirSync(join(root,'docs'),{withFileTypes:true}))if(entry.isFile()&&entry.name!=='README.md')errors.push(`docs root may only contain README.md: ${entry.name}`);
for(const error of errors)console.error(error);
console.log(`Checked ${paths.length} Markdown files; ${errors.length} local path / directory errors. Anchor contents and external URLs are not checked.`);
process.exitCode=errors.length?1:0;
