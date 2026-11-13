/// <reference types="node" />
// Releases a version of Skeudo: the five npm packages and the VS Code extension, all at that version, then
// its GitHub Release. The tag vX.Y.Z is the version's only record. The package.json files in the repository
// say 0.0.0, and the release writes the version into them in a worktree checked out at the tag. Each step is
// checked before it is done, so after a failure, running the same command again finishes the release.
//
//   pnpm release                  # the last release, the commits since, and the version they call for
//   pnpm release 0.2.0            # tags HEAD as v0.2.0, unless that tag exists, and publishes the tag
//   pnpm release 0.2.0 --dry-run  # only shows what is done, what is left, and the release notes
//
// Run it yourself, in a terminal, since it asks for an npm one-time code and an Open VSX token.
// .agents-docs/releasing.md says why each step works as it does. The extension stays "private": true,
// which vsce ignores, so that `pnpm publish -r` doesn't put it on npm.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { compareVersions, isFormatChange, nextVersion, parseVersion, releaseNotes, type Commit } from './versions.mts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRY = process.argv.includes('--dry-run');
const ARG = process.argv.slice(2).find((a) => !a.startsWith('-'));
const LIBRARIES = ['packages/core', 'packages/html', 'packages/markdown-it', 'packages/remark', 'apps/cli'];
const VSCODE = 'apps/vscode';
// What goes into a package. Commits that touch only other paths (the site, the spec, the agent docs) or
// only tests are left out of the release notes.
const PUBLISHED = ['packages', 'apps/cli', 'apps/vscode', ':(exclude,glob)**/test/**'];
const OPEN_VSX = 'https://open-vsx.org/api';
const bin = (name: string) => join(ROOT, VSCODE, 'node_modules/.bin', name);

type Manifest = { name: string; version: string; publisher?: string; repository?: { url: string } };
const manifest = (dir: string, root = ROOT): Manifest => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
const libraries = LIBRARIES.map((dir) => manifest(dir));
const ext = manifest(VSCODE);
const extId = `${ext.publisher}.${ext.name}`;
const repo = libraries[0].repository!.url.replace(/^git\+/, '').replace(/\.git$/, '');

/** Runs a command with its output shown, and throws when it fails. `input` goes to its standard input. */
function run(cmd: string, args: string[], { cwd = ROOT, env = process.env, input = undefined as string | undefined } = {}) {
  console.log(`\n$ ${[cmd.replace(ROOT, ''), ...args].join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, env, input, stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'] });
  if (result.status !== 0) throw new Error(`${cmd.replace(ROOT, '')} ${args[0]} failed.`);
}

/** A command's output, or null when it fails. */
function read(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Asks a question in the terminal, and exits on Ctrl+C or Ctrl+D. A secret answer isn't echoed: only the
 * callback readline lets `_writeToOutput` be replaced, which is why this isn't readline/promises.
 */
function ask(question: string, { secret = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let answered = false;
    rl.on('SIGINT', () => rl.close());
    rl.on('close', () => {
      if (answered) return;
      process.stdout.write('\n');
      process.exit(130);
    });
    if (secret) {
      process.stdout.write(question);
      (rl as unknown as { _writeToOutput(text: string): void })._writeToOutput = () => {};
    }
    rl.question(secret ? '' : question, (answer) => {
      answered = true;
      rl.close();
      if (secret) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const yes = async (question: string) => /^y(es)?$/i.test(await ask(question));

async function waitFor(what: string, check: () => boolean | Promise<boolean>, minutes: number) {
  process.stdout.write(`\nWaiting for ${what}`);
  const end = Date.now() + minutes * 60_000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`${what} didn't happen within ${minutes} minutes.`);
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  console.log(' done.');
}

// ---------- Git ----------

const short = (sha: string) => sha.slice(0, 7);
const tagCommit = (tag: string) => read('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`]);
const tagPushed = (tag: string) => !!read('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
const isAncestor = (a: string, b: string) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: ROOT }).status === 0;

/** Fetches main and the tags, and returns why it failed, or null. */
function fetchOrigin(): string | null {
  const result = spawnSync('git', ['fetch', '--quiet', '--tags', 'origin', 'main'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? null : `git fetch --tags origin main failed: ${result.stderr.trim()}`;
}

/** The release tags, highest version first. `v*` also matches the extension's old `vscode-v0.1.0`. */
const releaseTags = () =>
  (read('git', ['tag', '--list', 'v*']) ?? '')
    .split('\n')
    .filter((tag) => parseVersion(tag))
    .sort((a, b) => compareVersions(b, a));

/** The release before `tag`: the nearest other release tag on `commit` or before it, or null for the first. */
const previousRelease = (commit: string, tag: string) =>
  read('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '--exclude', tag, commit]);

/** The commits after `from` up to `to` that change a published package, oldest first. */
function changes(from: string | null, to: string): Commit[] {
  const log = read('git', ['log', '--reverse', '--format=%H %s', from ? `${from}..${to}` : to, '--', ...PUBLISHED]) ?? '';
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ sha: line.slice(0, 40), subject: line.slice(41) }));
}

/** Why `commit` isn't ready to release according to CI on main, or null. */
function ciProblem(commit: string): string | null {
  const runs = read('gh', ['run', 'list', '--commit', commit, '--branch', 'main', '--workflow', 'ci.yml', '--limit', '1', '--json', 'status,conclusion']);
  const ci = JSON.parse(runs ?? '[]')[0];
  if (!ci) return `CI hasn't run on ${short(commit)} on main, or gh can't see it (gh auth status).`;
  if (ci.status !== 'completed') return `CI is still running on ${short(commit)}: gh run watch.`;
  if (ci.conclusion !== 'success') return `CI failed on ${short(commit)}: gh run list --commit ${commit}.`;
  return null;
}

// ---------- Where a version is published ----------

const onNpm = (name: string, version: string) => read('npm', ['view', `${name}@${version}`, 'version']) === version;
const onMarketplace = (version: string) => {
  const shown = read(bin('vsce'), ['show', extId, '--json']);
  return !!shown && !!JSON.parse(shown).versions?.some((v: { version: string }) => v.version === version);
};
const onOpenVsx = async (version: string) => (await fetch(`${OPEN_VSX}/${ext.publisher}/${ext.name}/${version}`)).ok;
const hasRelease = (tag: string) => !!read('gh', ['release', 'view', tag, '--json', 'tagName']);

async function status(version: string) {
  const tag = `v${version}`;
  const s = {
    tag: tagPushed(tag),
    npmMissing: libraries.filter((m) => !onNpm(m.name, version)),
    marketplace: onMarketplace(version),
    openVsx: await onOpenVsx(version),
    release: hasRelease(tag),
  };
  return {
    ...s,
    /** Something is out, so the version is spoken for and its tag can't move. */
    published: s.npmMissing.length < libraries.length || s.marketplace || s.openVsx || s.release,
    done: s.tag && !s.npmMissing.length && s.marketplace && s.openVsx && s.release,
  };
}

// ---------- pnpm release: what to release next ----------

if (!ARG) {
  const fetchFailed = fetchOrigin();
  if (fetchFailed) console.log(`\n${fetchFailed}`);
  const last = releaseTags()[0] ?? null;
  if (!last) console.log('\nNo release yet.');
  else {
    console.log(`\nThe last release is ${last}, from ${short(tagCommit(last)!)}.`);
    if (!(await status(last.slice(1))).done) console.log(`It isn't finished: pnpm release ${last.slice(1)} --dry-run says what is left.`);
  }
  const commits = changes(last, 'HEAD');
  if (!commits.length) {
    console.log(`\nNo commit has changed the packages since ${last ?? 'the start'}.`);
    process.exit(0);
  }
  const one = commits.length === 1;
  console.log(`\n${commits.length} ${one ? 'commit' : 'commits'} since ${last ?? 'the start'} ${one ? 'changes' : 'change'} the packages:\n`);
  for (const c of commits) console.log(`  ${short(c.sha)} ${c.subject}`);
  if (last) {
    const next = nextVersion(last, commits);
    const why = commits.some((c) => isFormatChange(c.subject)) ? 'The format changes' : "The format doesn't change";
    console.log(`\n${why}, so the next version is ${next}: pnpm release ${next}`);
  }
  process.exit(0);
}

// ---------- pnpm release X.Y.Z: what there is, and what is missing ----------

if (!parseVersion(ARG)) {
  console.error(`"${ARG}" isn't a version. Usage: pnpm release [X.Y.Z] [--dry-run]`);
  process.exit(1);
}
const version = ARG.replace(/^v/, '');
const tag = `v${version}`;
const problems: string[] = [];
if (!DRY && !process.stdin.isTTY) {
  console.error('Run it in a terminal, since it asks questions, a code and a token. --dry-run asks nothing.');
  process.exit(1);
}

const fetchFailed = fetchOrigin();
if (fetchFailed) problems.push(fetchFailed);
const head = read('git', ['rev-parse', 'HEAD'])!;
const headIsMain = head === read('git', ['rev-parse', 'origin/main']);
const s = await status(version);

// The commit to release: the tag's, or HEAD for a new tag.
const tagged = tagCommit(tag);
let commit = tagged ?? head;
let moveTag = false;
if (!tagged) {
  const last = releaseTags()[0];
  if (!headIsMain) problems.push(`Push main first: ${tag} would tag HEAD, ${short(head)}, which isn't origin/main.`);
  if (last && compareVersions(version, last) <= 0) problems.push(`${version} must come after the last release, ${last}.`);
  // Releases go out one at a time, so npm's latest only ever moves forward.
  else if (last && !(await status(last.slice(1))).done) problems.push(`Finish ${last} first: pnpm release ${last.slice(1)}.`);
  if (s.published) problems.push(`${version} is published, but there is no ${tag} tag. Tag the commit it came from: git tag -a ${tag} <commit> -m "Skeudo ${version}".`);
} else if (tagged !== head && !s.published && headIsMain && isAncestor(tagged, head)) {
  // Nothing has gone out from the tag, so it can still move, to take in a fix.
  const question = `${tag} is on ${short(tagged)}, and nothing is published from it. Move it to HEAD, ${short(head)}?`;
  if (DRY) console.log(`\n${question} A real run asks.`);
  else if (await yes(`\n${question} [y/N] `)) {
    commit = head;
    moveTag = true;
  }
}
const ci = ciProblem(commit);
if (ci) problems.push(ci);

const previous = previousRelease(commit, tag);
const commits = changes(previous, commit);
const notes = releaseNotes({ version, previous, commits, repo });

const line = (done: boolean, text: string) => console.log(`  ${done ? '✓' : '→'} ${text}`);
console.log(`\nRelease ${version} from ${short(commit)}, ✓ done, → to do:\n`);
line(s.tag && !moveTag, `git: tag ${tag} on ${short(commit)}`);
for (const m of libraries) line(!s.npmMissing.includes(m), `npm: ${m.name} ${version}`);
line(s.marketplace, `Visual Studio Marketplace: ${extId} ${version}`);
line(s.openVsx, `Open VSX: ${extId} ${version}`);
line(s.release, `GitHub: release ${tag}`);
if (!s.release) {
  console.log(`\nRelease notes, from the commits since ${previous ?? 'the start'} that change the packages:\n`);
  console.log(notes.replace(/^(?=.)/gm, '    '));
}
if (!tagged && previous && nextVersion(previous, commits) !== version) {
  console.log(`\nNote: the commits since ${previous} call for ${nextVersion(previous, commits)}, not ${version}.`);
}

if (problems.length) {
  console.log(`\n${DRY ? 'Before a real run:' : 'Stopped:'}\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(DRY ? 0 : 1);
}
if (s.done && !moveTag) {
  console.log(`\n${version} is released.`);
  process.exit(0);
}
if (DRY || !(await yes('\nRelease? [y/N] '))) process.exit(0);

// ---------- Releasing ----------

/**
 * Checks out `commit` in a temporary worktree, writes the version into each package.json and the release
 * notes into the extension's CHANGELOG.md, then builds everything, so a build that fails leaves no tag.
 */
function prepare(dir: string) {
  run('git', ['worktree', 'add', '--detach', dir, commit]);
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dir });
  for (const pkg of [...LIBRARIES, VSCODE]) {
    writeFileSync(join(dir, pkg, 'package.json'), JSON.stringify({ ...manifest(pkg, dir), version }, null, 2) + '\n');
  }
  // The Marketplace and Open VSX show it in the extension's Changelog tab.
  writeFileSync(join(dir, VSCODE, 'CHANGELOG.md'), `# Changelog\n\n## ${version}\n\n${notes}\n\nEvery release: ${repo}/releases\n`);
  run('pnpm', ['build:packages'], { cwd: dir });
  run('pnpm', ['build:cli'], { cwd: dir });
  run('pnpm', ['package:vscode'], { cwd: dir });
}

function pushTag() {
  const message = `Skeudo ${version}`;
  if (moveTag) {
    run('git', ['tag', '--force', '-a', tag, commit, '-m', message]);
    run('git', ['push', '--force', 'origin', `refs/tags/${tag}`]);
    return;
  }
  if (!tagCommit(tag)) run('git', ['tag', '-a', tag, commit, '-m', message]);
  if (!tagPushed(tag)) run('git', ['push', 'origin', `refs/tags/${tag}`]);
}

async function publishNpm(dir: string) {
  const user = read('npm', ['whoami']);
  if (!user) throw new Error('Log in to npm first: npm login.');
  console.log(`\nnpm: publishing ${s.npmMissing.map((m) => m.name).join(', ')} as ${user}.`);
  for (;;) {
    const otp = await ask('npm one-time code, from your authenticator app: ');
    try {
      run('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', `--otp=${otp}`], { cwd: dir });
      break;
    } catch {
      // A code lasts about 30 seconds, and a second run skips the packages already published.
      if (!(await yes('pnpm publish failed. Try again with a new code? [y/N] '))) throw new Error('npm publish stopped.');
    }
  }
  await waitFor(`npm to list ${version} for all five`, () => libraries.every((m) => onNpm(m.name, version)), 10);
  // A first publish briefly points latest at npm's 0.0.0-stage placeholder.
  await waitFor(`latest to point at ${version}`, () => libraries.every((m) => read('npm', ['view', m.name, 'dist-tags.latest']) === version), 10);
}

async function publishExtension(dir: string) {
  const file = `${ext.name}-${version}.vsix`;
  // Copied out of the worktree, so the file is still there after the release, for an upload by hand.
  const vsix = join(ROOT, VSCODE, file);
  copyFileSync(join(dir, VSCODE, file), vsix);
  if (!s.marketplace) {
    if (process.env.VSCE_PAT) run(bin('vsce'), ['publish', '--packagePath', vsix]);
    else {
      console.log(`
Visual Studio Marketplace: upload this file by hand, since vsce publish needs an Azure DevOps token (VSCE_PAT).
  ${vsix}
Open https://marketplace.visualstudio.com/manage/publishers/${ext.publisher}, then choose Update in the extension's
"..." menu.`);
      await ask('\nPress Enter once it is uploaded. ');
    }
    await waitFor(`the Marketplace to list ${extId} ${version}, which takes a few minutes`, () => onMarketplace(version), 20);
  }
  if (!s.openVsx) {
    // ovsx publishes under the manifest's publisher, which is also the Open VSX namespace.
    console.log(`\nOpen VSX: publishing to the ${ext.publisher} namespace. Tokens are at https://open-vsx.org/user-settings/tokens.`);
    const token = process.env.OVSX_PAT || (await ask('Open VSX access token (not shown): ', { secret: true }));
    run(bin('ovsx'), ['publish', '--packagePath', vsix], { env: { ...process.env, OVSX_PAT: token } });
    await waitFor(`Open VSX to list ${extId} ${version}`, () => onOpenVsx(version), 10);
  }
}

const needsBuild = s.npmMissing.length > 0 || !s.marketplace || !s.openVsx;
const dir = needsBuild ? mkdtempSync(join(tmpdir(), 'skeudo-release-')) : null;
// An `exit` listener also runs on process.exit, as when Ctrl+C stops a question.
process.on('exit', () => {
  if (!dir) return;
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT });
  rmSync(dir, { recursive: true, force: true });
});

try {
  if (dir) prepare(dir);
  pushTag();
  if (dir && s.npmMissing.length) await publishNpm(dir);
  if (dir && (!s.marketplace || !s.openVsx)) await publishExtension(dir);
  // Last, so a release on GitHub means everything is out.
  if (!s.release) run('gh', ['release', 'create', tag, '--verify-tag', '--title', `Skeudo ${version}`, '--notes-file', '-'], { input: notes });
} catch (error) {
  console.error(`\n${(error as Error).message}\nRun pnpm release ${version} again once that is fixed: it skips what is done.`);
  process.exit(1);
}

console.log(`
Released:
  ${repo}/releases/tag/${tag}
  https://www.npmjs.com/package/skeudo/v/${version}
  https://marketplace.visualstudio.com/items?itemName=${extId}
  https://open-vsx.org/extension/${ext.publisher}/${ext.name}/${version}`);
