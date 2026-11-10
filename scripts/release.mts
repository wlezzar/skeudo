/// <reference types="node" />
// Publishes what the current versions still lack: the five npm packages, the VS Code extension on the
// Marketplace and on Open VSX, and the git tags of both. It checks each step before doing it, so after a
// failure, running it again picks up where it stopped. Run it yourself, in a terminal, on a clean `main`
// that CI has passed, since it asks for an npm one-time code and an Open VSX token.
//
//   pnpm release            # shows what it would publish, asks, then publishes
//   pnpm release --dry-run  # only shows what it would publish
//
// Set the versions and the changelogs first: .agents-docs/releasing.md says how, and why each step works
// as it does. The extension stays "private": true, which vsce ignores, so that `pnpm publish -r` doesn't
// put it on npm.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DRY = process.argv.includes('--dry-run');
const LIBRARIES = ['packages/core', 'packages/html', 'packages/markdown-it', 'packages/remark', 'apps/cli'];
const VSCODE = 'apps/vscode';
const OPEN_VSX = 'https://open-vsx.org/api';
const bin = (name: string) => join(ROOT, VSCODE, 'node_modules/.bin', name);

type Manifest = { name: string; version: string; publisher?: string };
const manifest = (dir: string): Manifest => JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));

/** Runs a command with its output shown, and throws when it fails. */
function run(cmd: string, args: string[], { cwd = ROOT, env = process.env } = {}) {
  console.log(`\n$ ${[cmd.replace(ROOT, ''), ...args].join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
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

const found = async (url: string) => (await fetch(url)).ok;
const tagCommit = (tag: string) => read('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`]);
const tagPushed = (tag: string) => !!read('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);

/** Tags `commit`, unless the tag exists, and pushes the tag. */
function pushTag(tag: string, commit: string, message: string) {
  if (!tagCommit(tag)) run('git', ['tag', '-a', tag, commit, '-m', message]);
  if (!tagPushed(tag)) run('git', ['push', 'origin', `refs/tags/${tag}`]);
}

// ---------- What there is, and what is missing ----------

const problems: string[] = [];
if (read('git', ['branch', '--show-current']) !== 'main') problems.push('Switch to main.');
if (read('git', ['status', '--porcelain', '--untracked-files=no'])) problems.push('Commit or stash your changes first.');
read('git', ['fetch', '--quiet', 'origin', 'main']);
const head = read('git', ['rev-parse', 'HEAD'])!;
const short = head.slice(0, 7);
if (head !== read('git', ['rev-parse', 'origin/main'])) problems.push(`Push main first: ${short} isn't origin/main.`);
const ci = JSON.parse(read('gh', ['run', 'list', '--commit', head, '--workflow', 'ci.yml', '--limit', '1', '--json', 'status,conclusion']) ?? '[]')[0];
if (!ci) problems.push(`CI hasn't run on ${short}, or gh can't see it (gh auth status).`);
else if (ci.status !== 'completed') problems.push(`CI is still running on ${short}: gh run watch.`);
else if (ci.conclusion !== 'success') problems.push(`CI failed on ${short}: gh run list --commit ${head}.`);
if (!DRY && !process.stdin.isTTY) problems.push('Run it in a terminal, since it asks for a code and a token.');

const libraries = LIBRARIES.map(manifest);
const version = libraries[0].version;
if (libraries.some((m) => m.version !== version)) {
  problems.push(`The five packages must share one version: ${libraries.map((m) => `${m.name} ${m.version}`).join(', ')}.`);
}
const ext = manifest(VSCODE);
const extId = `${ext.publisher}.${ext.name}`;
for (const [file, v] of [['CHANGELOG.md', version], [`${VSCODE}/CHANGELOG.md`, ext.version]]) {
  if (!readFileSync(join(ROOT, file), 'utf8').includes(`\n## ${v}\n`)) problems.push(`${file} has no "## ${v}" entry.`);
}

const onNpm = (m: Manifest) => read('npm', ['view', `${m.name}@${version}`, 'version']) === version;
const npmMissing = libraries.filter((m) => !onNpm(m));
const npmTag = `v${version}`;

const onMarketplace = () => {
  const shown = read(bin('vsce'), ['show', extId, '--json']);
  return !!shown && !!JSON.parse(shown).versions?.some((v: { version: string }) => v.version === ext.version);
};
const onOpenVsx = () => found(`${OPEN_VSX}/${ext.publisher}/${ext.name}/${ext.version}`);
const marketplaceMissing = !onMarketplace();
const openVsxMissing = !(await onOpenVsx());
const extTag = `vscode-v${ext.version}`;
// A version already in one store comes from its tag, so both stores get the same extension.
const extCommit = tagCommit(extTag) ?? head;

if (npmMissing.length && tagCommit(npmTag) && tagCommit(npmTag) !== head) {
  problems.push(`${npmTag} tags another commit than ${short}, so this needs a new version.`);
}
if (!npmMissing.length && !tagCommit(npmTag)) problems.push(`npm has ${version}, but there is no ${npmTag} tag. Tag the commit it came from.`);
if (marketplaceMissing !== openVsxMissing && !tagCommit(extTag)) {
  problems.push(`One store has the extension ${ext.version}, but there is no ${extTag} tag to build the same file from.`);
}

const status = (done: boolean, text: string) => console.log(`  ${done ? '✓' : '→'} ${text}`);
console.log(`\nRelease from ${short}, ✓ done, → to do:\n`);
for (const m of libraries) status(!npmMissing.includes(m), `npm: ${m.name} ${version}`);
status(tagPushed(npmTag), `git: tag ${npmTag}`);
status(!marketplaceMissing, `Visual Studio Marketplace: ${extId} ${ext.version}`);
status(!openVsxMissing, `Open VSX: ${extId} ${ext.version}`);
status(tagPushed(extTag), `git: tag ${extTag}${extCommit === head ? '' : `, on ${extCommit.slice(0, 7)}`}`);

const todo = npmMissing.length || marketplaceMissing || openVsxMissing || !tagPushed(npmTag) || !tagPushed(extTag);
if (problems.length) {
  console.log(`\n${DRY ? 'Before a real run:' : 'Stopped:'}\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(DRY ? 0 : 1);
}
if (!todo) {
  console.log('\nNothing to publish.');
  process.exit(0);
}
if (DRY) process.exit(0);
if (!/^y(es)?$/i.test(await ask('\nPublish? [y/N] '))) process.exit(0);

// ---------- Publishing ----------

/** Packages the extension from `commit`, in a separate worktree when it isn't the one checked out. */
function packageExtension(commit: string): string {
  const file = `${ext.name}-${ext.version}.vsix`;
  if (commit === head) {
    run('pnpm', ['package:vscode']);
    return join(ROOT, VSCODE, file);
  }
  const dir = mkdtempSync(join(tmpdir(), 'skeudo-release-'));
  try {
    run('git', ['worktree', 'add', '--detach', dir, commit]);
    run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dir });
    run('pnpm', ['package:vscode'], { cwd: dir });
    copyFileSync(join(dir, VSCODE, file), join(ROOT, VSCODE, file));
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT });
    rmSync(dir, { recursive: true, force: true });
  }
  return join(ROOT, VSCODE, file);
}

try {
  if (npmMissing.length) {
    const user = read('npm', ['whoami']);
    if (!user) throw new Error('Log in to npm first: npm login.');
    console.log(`\nnpm: publishing ${npmMissing.map((m) => m.name).join(', ')} as ${user}.`);
    for (;;) {
      const otp = await ask('npm one-time code, from your authenticator app: ');
      try {
        run('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', `--otp=${otp}`]);
        break;
      } catch {
        // A code lasts about 30 seconds, and a second run skips the packages already published.
        if (!/^y(es)?$/i.test(await ask('pnpm publish failed. Try again with a new code? [y/N] '))) throw new Error('npm publish stopped.');
      }
    }
    await waitFor(`npm to list ${version} for all five`, () => libraries.every(onNpm), 10);
    // A first publish briefly points latest at npm's 0.0.0-stage placeholder.
    await waitFor(`latest to point at ${version}`, () => libraries.every((m) => read('npm', ['view', m.name, 'dist-tags.latest']) === version), 10);
  }
  pushTag(npmTag, head, `Skeudo ${version}`);

  if (marketplaceMissing || openVsxMissing) {
    const vsix = packageExtension(extCommit);
    if (marketplaceMissing) {
      if (process.env.VSCE_PAT) run(bin('vsce'), ['publish', '--packagePath', vsix]);
      else {
        console.log(`
Visual Studio Marketplace: upload this file by hand, since vsce publish needs an Azure DevOps token (VSCE_PAT).
  ${vsix}
Open https://marketplace.visualstudio.com/manage/publishers/${ext.publisher}, then choose Update in the extension's
"..." menu, or New extension, then Visual Studio Code, for its first upload.`);
        await ask('\nPress Enter once it is uploaded. ');
      }
      await waitFor(`the Marketplace to list ${extId} ${ext.version}, which takes a few minutes`, onMarketplace, 20);
    }
    if (openVsxMissing) {
      // ovsx publishes under the manifest's publisher, which is also the Open VSX namespace.
      console.log(`\nOpen VSX: publishing to the ${ext.publisher} namespace. Tokens are at https://open-vsx.org/user-settings/tokens.`);
      const token = process.env.OVSX_PAT || (await ask('Open VSX access token (not shown): ', { secret: true }));
      run(bin('ovsx'), ['publish', '--packagePath', vsix], { env: { ...process.env, OVSX_PAT: token } });
      await waitFor(`Open VSX to list ${extId} ${ext.version}`, onOpenVsx, 10);
    }
  }
  pushTag(extTag, extCommit, `VS Code extension ${ext.version}`);
} catch (error) {
  console.error(`\n${(error as Error).message}\nRun it again once that is fixed: it skips what is done.`);
  process.exit(1);
}

console.log(`
Published:
  https://www.npmjs.com/package/skeudo/v/${version}
  https://marketplace.visualstudio.com/items?itemName=${extId}
  https://open-vsx.org/extension/${ext.publisher}/${ext.name}`);
