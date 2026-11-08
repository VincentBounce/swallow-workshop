import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
// private names to ban as well, one per line, in a git-ignored file
const LOCAL_NAMES = join(__dirname, 'banned-names.local');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|html|css)$/.test(f) ? [p] : [];
  });
}

function bannedNames(): RegExp {
  const local = existsSync(LOCAL_NAMES)
    ? readFileSync(LOCAL_NAMES, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];
  const escaped = local.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(['kokoro', ...escaped].join('|'), 'i');
}

describe('what the interface says', () => {
  it('names no internal project or model', () => {
    // the simulator talks only about the physics and the published paper
    const banned = bannedNames();
    const hits = [...files(join(ROOT, 'src')), join(ROOT, 'index.html'), join(ROOT, 'README.md')]
      .filter((f) => banned.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual([]);
  });
});
