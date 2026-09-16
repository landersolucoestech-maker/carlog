import { mkdir, writeFile, symlink, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const buildRoot = join(process.cwd(), '.build', 'core');
const scopeRoot = join(buildRoot, 'node_modules', '@carlog');
await mkdir(scopeRoot, { recursive: true });

for (const name of ['auth','events']) {
  const generated = join(buildRoot, 'packages', name);
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, 'package.json'), JSON.stringify({
    name: `@carlog/${name}`,
    private: true,
    type: 'module',
    exports: './src/index.js',
  }, null, 2));
  const link = join(scopeRoot, name);
  try { await lstat(link); } catch {
    await symlink(relative(scopeRoot, generated), link, 'dir');
  }
}
