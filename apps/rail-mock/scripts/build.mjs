import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
  }
  return files;
}

const files = await collect('src');
if (files.length === 0) throw new Error('No TypeScript sources found under src/');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Node ${process.versions.node} accepted ${files.length} TypeScript source file(s).`);
