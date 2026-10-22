import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|html|css)$/.test(f) ? [p] : [];
  });
}

describe('what the interface says', () => {
  it('names no internal project or model', () => {
    // the simulator talks only about the physics and the published paper
    const banned = /kokoro/i;
    const hits = [...files(join(ROOT, 'src')), join(ROOT, 'index.html'), join(ROOT, 'README.md')]
      .filter((f) => banned.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual([]);
  });
});
