/// <reference types="node" />
// Bundles the CLI into dist/skeudo.js, one file with no dependencies. The workspace packages export
// TypeScript sources, which Node can't load from a package.
import { build as bundle } from 'esbuild';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readStylesheet } from '../../scripts/stylesheet.mts';

/** Writes skeudo.js to `outdir` and returns its path. */
export async function build(outdir: string): Promise<string> {
  await mkdir(outdir, { recursive: true });
  const src = (file: string) => fileURLToPath(new URL(`src/${file}`, import.meta.url));
  const common = { bundle: true, target: 'es2022', logLevel: 'warning' } as const;

  const manifest = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8'));
  // Rendered pages inline skeudo.css with the page's own styles, and the script that highlights variables.
  const css = readStylesheet(new URL(import.meta.resolve('@skeudo/html/skeudo.css'))) + '\n' + (await readFile(src('page.css'), 'utf8'));
  const script = await bundle({ ...common, entryPoints: [src('page.ts')], write: false, platform: 'browser', format: 'iife', minify: true });

  const outfile = `${outdir}/skeudo.js`;
  await bundle({
    ...common,
    entryPoints: [src('main.ts')],
    outfile,
    platform: 'node',
    format: 'esm',
    banner: { js: '#!/usr/bin/env node' },
    define: {
      SKEUDO_VERSION: JSON.stringify(manifest.version),
      SKEUDO_CSS: JSON.stringify(css),
      SKEUDO_SCRIPT: JSON.stringify(script.outputFiles[0].text),
    },
  });
  await chmod(outfile, 0o755);
  return outfile;
}

if (import.meta.main) await build(fileURLToPath(new URL('dist', import.meta.url)));
