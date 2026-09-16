import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const roots = ['apps','packages','supabase','infrastructure','tests','docs'];
const ignored = new Set(['node_modules','.next','dist','.build','coverage']);
const textExtensions = new Set(['.ts','.tsx','.js','.mjs','.sql','.md','.yml','.yaml','.json','.css','.sh','.conf']);
const failures = [];

async function walk(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  for (const name of await readdir(path)) {
    if (ignored.has(name)) continue;
    const full = join(path,name);
    const info = await stat(full);
    if (info.isDirectory()) { await walk(full); continue; }
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (!textExtensions.has(extension) && name !== 'Dockerfile') continue;
    const file = relative(root,full).replaceAll('\\','/');
    const source = await readFile(full,'utf8');
    const checks = [
      [/\bTwilio\b|\btwilio\b/g,'unsupported telephony provider reference'],
      [/\bVercel\b|\bvercel\b/g,'unsupported hosting reference'],
      [/\btenant_id\b|\btenantId\b|\borganization_id\b|\borganizationId\b/g,'multi-company partitioning reference'],
      [/\bTODO\b|\bFIXME\b|\.only\(|\.skip\(/g,'unfinished or disabled implementation marker'],
      [/\b(cliente|cotação|pedido|transportadora|usuário|configurações|integrações|automação|empresa|mensagem|chamada|página|relatório)\b/gi,'non-English product or engineering term'],
    ];
    for (const [pattern,label] of checks) if (pattern.test(source)) failures.push(`${file}: ${label}`);
  }
}

for (const item of roots) await walk(join(root,item));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture audit passed.');
}
