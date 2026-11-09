/// <reference types="node" />
// Bundles the extension into dist/. The workspace packages export TypeScript sources, which VS Code can't load.
import { build as bundle } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readStylesheet } from '../../scripts/stylesheet.mts';
import { markdownInjection, sketchGrammar } from './src/grammars/index.ts';

const LIGHT_THEMES = 'body.vscode-light, body.vscode-high-contrast-light';
const DARK_THEMES = 'body.vscode-dark, body.vscode-high-contrast:not(.vscode-high-contrast-light)';

/**
 * skeudo.css for the Markdown preview. skeudo.css follows the system's light or dark mode, and the preview
 * follows VS Code's theme instead, so the light and dark colors also apply under the theme classes VS Code
 * puts on the preview's body. Sketches also use the editor's font, and are spaced like code blocks.
 */
export function previewCss(css: string): string {
  const themed = replaceOnce(
    replaceOnce(css, ':root {', `:root,\n${LIGHT_THEMES} {`),
    ":root[data-theme='dark'] {",
    `:root[data-theme='dark'],\n${DARK_THEMES} {`,
  );
  return (
    themed +
    '\n/* VS Code */\n' +
    // Same specificity as the theme rules above, so it must come after them.
    'body.vscode-body { --sk-font: var(--vscode-editor-font-family, monospace); }\n' +
    'body.vscode-body .sketch,\nbody.vscode-body .skd { margin: 0 0 1rem; }\n'
  );
}

function replaceOnce(text: string, search: string, replacement: string): string {
  const count = text.split(search).length - 1;
  if (count !== 1) throw new Error(`expected one "${search}" in skeudo.css, found ${count}`);
  return text.replace(search, replacement);
}

/** Writes extension.js, preview.js, skeudo.css and the grammars to `outdir`. */
export async function build(outdir: string): Promise<void> {
  await mkdir(outdir, { recursive: true });
  const src = (file: string) => fileURLToPath(new URL(`src/${file}`, import.meta.url));
  const common = { bundle: true, target: 'es2022', logLevel: 'warning' } as const;
  const css = readStylesheet(new URL(import.meta.resolve('@skeudo/html/skeudo.css')));
  await Promise.all([
    // VS Code supplies the `vscode` module, and the markdown-it instance the plugin extends.
    bundle({ ...common, entryPoints: [src('extension.ts')], outfile: `${outdir}/extension.js`, platform: 'node', format: 'cjs', external: ['vscode'] }),
    bundle({ ...common, entryPoints: [src('preview.ts')], outfile: `${outdir}/preview.js`, platform: 'browser', format: 'iife' }),
    writeFile(`${outdir}/skeudo.css`, previewCss(css)),
    writeFile(`${outdir}/skeudo.tmLanguage.json`, JSON.stringify(sketchGrammar, null, 2) + '\n'),
    writeFile(`${outdir}/markdown-skeudo.tmLanguage.json`, JSON.stringify(markdownInjection, null, 2) + '\n'),
  ]);
}

if (import.meta.main) await build(fileURLToPath(new URL('dist', import.meta.url)));
