import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const roots = ['apps', 'packages', 'supabase', 'infrastructure', 'tests', 'docs', '.github'];
const rootFiles = ['.env.example', 'README.txt', 'index.html', '404.html', 'package.json'];
const ignored = new Set(['node_modules', '.next', 'dist', '.build', 'coverage']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql', '.md', '.yml', '.yaml', '.json', '.css', '.sh', '.conf', '.html', '.txt']);
const failures = [];

const checks = [
  [/\bTwilio\b|\btwilio\b/g, 'unsupported telephony provider reference'],
  [/\bVercel\b|\bvercel\b/g, 'unsupported hosting reference'],
  [/\btenant_id\b|\btenantId\b|\borganization_id\b|\borganizationId\b/g, 'multi-company partitioning reference'],
  [/carlogconnection[.]com/gi, 'deprecated hostname reference'],
  [/\bTODO\b|\bFIXME\b|\.only\(|\.skip\(/g, 'unfinished or disabled implementation marker'],
  [/\b(cliente|cotação|pedido|transportadora|usuário|configurações|integrações|automação|empresa|mensagem|chamada|página|relatório)\b/gi, 'non-English product or engineering term'],
];

async function checkFile(path) {
  const file = relative(root, path).replaceAll('\\', '/');
  const source = await readFile(path, 'utf8');
  for (const [pattern, label] of checks) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) failures.push(`${file}: ${label}`);
  }
}

async function walk(path) {
  try {
    await access(path);
  } catch {
    return;
  }

  for (const name of await readdir(path)) {
    if (ignored.has(name)) continue;
    const full = join(path, name);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (!textExtensions.has(extension) && name !== 'Dockerfile') continue;
    await checkFile(full);
  }
}

for (const item of roots) await walk(join(root, item));
for (const file of rootFiles) {
  try {
    await access(join(root, file));
    await checkFile(join(root, file));
  } catch {
    // Optional root files may not exist in every checkout.
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture audit passed.');
}
