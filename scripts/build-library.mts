/// <reference types="node" />
// Builds the library in the current folder for publishing, as its `pnpm build`: compiles src/ to dist/
// with the libraries it imports, writes each stylesheet that publishConfig exports, inlined into one
// file, and copies the root LICENSE in, since npm only packs a LICENSE from the package's own folder.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readStylesheet } from './stylesheet.mts';

type Exports = Record<string, string | Record<string, string>>;

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const dev: Exports = manifest.exports;
const published: Exports = manifest.publishConfig?.exports ?? {};

rmSync('dist', { recursive: true, force: true });
execFileSync('pnpm', ['exec', 'tsc', '-b', 'tsconfig.build.json'], { stdio: 'inherit' });

for (const [entry, target] of Object.entries(published)) {
  if (typeof target !== 'string' || !target.endsWith('.css')) continue;
  const source = dev[entry];
  if (typeof source !== 'string') throw new Error(`${manifest.name}: ${entry} has no stylesheet in exports`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readStylesheet(pathToFileURL(source)));
}

copyFileSync(new URL('../LICENSE', import.meta.url), 'LICENSE');
