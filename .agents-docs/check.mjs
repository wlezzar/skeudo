#!/usr/bin/env node
// Checks the agent docs (AGENTS.md and .agents-docs/) for the ways they go stale:
// - a file over the token budget (estimated as characters / 4);
// - a relative link, or its #anchor, that no longer resolves;
// - a repository path in `backticks` that no longer exists;
// - a doc missing from the table in .agents-docs/README.md.
// Usage: node .agents-docs/check.mjs   (exits with 1 when something is broken)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const WARN_TOKENS = 4000;
const MAX_TOKENS = 5000;

const DOCS = import.meta.dirname;
const ROOT = resolve(DOCS, '..');
const files = [join(ROOT, 'AGENTS.md'), ...walk(DOCS)];
const rootEntries = new Set(readdirSync(ROOT).filter((e) => e !== 'node_modules' && e !== '.git'));

const errors = [];
const warnings = [];
const rel = (file) => relative(ROOT, file);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : e.name.endsWith('.md') ? [path] : [];
  });
}

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces as hyphens. */
function anchors(file) {
  const text = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '');
  return new Set(
    [...text.matchAll(/^#+\s+(.*)$/gm)].map((m) =>
      m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'),
    ),
  );
}

/** Tokens in inline code that look like repository paths: their first segment is at the root. */
function repoPaths(code) {
  return code
    .split(/\s+/)
    .map((t) => t.replace(/^\.\//, '').replace(/[.,:;)]+$/, '').replace(/:\d+(-\d+)?$/, ''))
    .filter((t) => t && !/[*<>${}~"']/.test(t) && !/(^|\/)(dist|node_modules)\//.test(t))
    .filter((t) => rootEntries.has(t.split('/')[0]));
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const tokens = Math.round(text.length / 4);
  if (tokens > MAX_TOKENS) errors.push(`${rel(file)}: about ${tokens} tokens, over ${MAX_TOKENS}. Split it by task.`);
  else if (tokens > WARN_TOKENS) warnings.push(`${rel(file)}: about ${tokens} tokens, near the ${MAX_TOKENS} budget.`);

  const prose = text.replace(/^```[\s\S]*?^```/gm, '');

  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue;
    const [path, anchor] = target.split('#');
    const dest = path ? resolve(dirname(file), path) : file;
    if (!existsSync(dest)) {
      errors.push(`${rel(file)}: link to ${target}, which doesn't exist.`);
    } else if (anchor && dest.endsWith('.md') && statSync(dest).isFile() && !anchors(dest).has(anchor)) {
      errors.push(`${rel(file)}: link to ${target}, but ${rel(dest)} has no heading #${anchor}.`);
    }
  }

  for (const [, code] of prose.matchAll(/`([^`\n]+)`/g)) {
    for (const path of repoPaths(code)) {
      if (!existsSync(join(ROOT, path))) errors.push(`${rel(file)}: \`${path}\` doesn't exist.`);
    }
  }
}

const index = readFileSync(join(DOCS, 'README.md'), 'utf8');
for (const file of walk(DOCS)) {
  const name = relative(DOCS, file);
  if (name !== 'README.md' && !index.includes(`](${name})`)) {
    errors.push(`.agents-docs/README.md: ${name} isn't in the table of docs.`);
  }
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
const total = files.reduce((n, f) => n + Math.round(readFileSync(f, 'utf8').length / 4), 0);
console.log(`Checked ${files.length} files, about ${total} tokens in all: ${errors.length} errors, ${warnings.length} warnings.`);
process.exit(errors.length ? 1 : 0);
