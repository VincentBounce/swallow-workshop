/**
 * Runs the automated test suite and prints every validation number the tests
 * record (lines starting with "[validation]") as one table.
 *   npm run validate
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const run = spawnSync(process.execPath, [cli, 'run', '--silent=false'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const text = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

const rows: [string, string][] = [];
const seen = new Set<string>();
for (const line of text.split(/\r?\n/)) {
  const m = /\[validation\]\s+([^:]+):\s+(.*)$/.exec(line);
  if (!m || seen.has(m[1])) continue;
  seen.add(m[1]);
  rows.push([m[1].trim(), m[2].trim()]);
}

const width = Math.max(10, ...rows.map(([k]) => k.length));
console.log(`${'measure'.padEnd(width)}  value`);
console.log(`${'-'.repeat(width)}  ${'-'.repeat(40)}`);
for (const [k, v] of rows) console.log(`${k.padEnd(width)}  ${v}`);

const summary = text.split(/\r?\n/).filter((l) => /Test Files|Tests\s/.test(l)).map((l) => l.trim());
console.log('');
for (const l of summary) console.log(l);
if (run.status !== 0) {
  console.log('\nSome tests failed; run "npm test" for details.');
}
process.exit(run.status ?? 1);
