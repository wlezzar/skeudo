/// <reference types="node" />
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatProblem, isSketchFile, load, problems, renderPage, type Doc } from './document';

// Set by build.mts.
declare const SKEUDO_VERSION: string;
declare const SKEUDO_CSS: string;
declare const SKEUDO_SCRIPT: string;

const USAGE = `skeudo: check and render sketches, pseudocode for code review with every outside effect tagged

Usage:
  skeudo check [path...]         Report the warnings in sketches. Exits with 1 when there are any.
  skeudo render [file] [-o out]  Render a sketch or a Markdown document as a standalone HTML page.

A path is a Markdown file, whose \`\`\`sketch fences are checked, a .sketch file, or a directory
to search for both. With no path, or with -, the input is read from stdin, and it is Markdown
when it has a sketch fence.

Options for render:
  -o, --output <file>  Write the page to a file instead of stdout.
  --src-base <url>     Base URL for ::src links, such as https://github.com/org/repo/blob/<sha>/.
                       Defaults to srcBase in the document's front matter.

  -h, --help           Show this help.
  -v, --version        Show the version.
`;

/** A problem with how skeudo was called, or with reading its input. Exits with 2. */
class UsageError extends Error {}

const STDIN = '<stdin>';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new UsageError('no input: pass a file, or pipe a sketch to stdin');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** `can't read x.md: no such file or directory`, from Node's `ENOENT: no such file or directory, open 'x.md'`. */
const cantRead = (path: string, e: Error) =>
  new UsageError(`can't read ${path}: ${/^[A-Z]+: (.*?), \w+ '.*'$/.exec(e.message)?.[1] ?? e.message}`);

async function readDoc(path: string): Promise<Doc> {
  if (path === STDIN) return load(STDIN, await readStdin());
  try {
    return load(path, await readFile(path, 'utf8'));
  } catch (e) {
    throw cantRead(path, e as Error);
  }
}

/** Expands directories into the Markdown and .sketch files under them, skipping hidden folders and node_modules. */
async function expand(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const path of paths) {
    if (path === '-') {
      files.push(STDIN);
      continue;
    }
    const info = await stat(path).catch((e: Error) => {
      throw cantRead(path, e);
    });
    if (info.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && isSketchFile(entry.name)) files.push(path);
  }
  return files;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

async function check(args: string[]): Promise<number> {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  const files = await expand(positionals.length ? positionals : ['-']);
  let sketches = 0;
  let warnings = 0;
  for (const file of files) {
    const doc = await readDoc(file);
    sketches += doc.sketches.length;
    for (const problem of problems(doc)) {
      console.log(formatProblem(doc, problem));
      warnings++;
    }
  }
  const where = files.length > 1 ? ` in ${plural(files.length, 'file')}` : '';
  if (!sketches) console.log(`No sketches found${where}.`);
  else console.log(`Checked ${plural(sketches, 'sketch', 'sketches')}${where}: ${warnings ? plural(warnings, 'warning') : 'no warnings'}.`);
  return warnings ? 1 : 0;
}

async function render(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { output: { type: 'string', short: 'o' }, 'src-base': { type: 'string' } },
  });
  if (positionals.length > 1) throw new UsageError('render takes one file');
  const doc = await readDoc(!positionals.length || positionals[0] === '-' ? STDIN : positionals[0]);
  // A sketch always renders, so warnings don't stop the page. They go to stderr, to keep stdout for the page.
  for (const problem of problems(doc)) console.error(formatProblem(doc, problem));
  const page = renderPage(doc, { srcBase: values['src-base'], css: SKEUDO_CSS, script: SKEUDO_SCRIPT });
  if (values.output) await writeFile(values.output, page);
  else process.stdout.write(page);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const wantsHelp = args.includes('-h') || args.includes('--help');
  switch (command) {
    case 'check':
      return wantsHelp ? help() : check(args);
    case 'render':
      return wantsHelp ? help() : render(args);
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      return help();
    case '-v':
    case '--version':
      console.log(SKEUDO_VERSION);
      return 0;
    default:
      throw new UsageError(`unknown command: ${command}`);
  }
}

function help(): number {
  process.stdout.write(USAGE);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  // parseArgs reports unknown options with a TypeError that has a code.
  if (e instanceof UsageError || (e as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`skeudo: ${(e as Error).message}\nRun skeudo --help for usage.`);
    process.exitCode = 2;
  } else {
    throw e;
  }
}
