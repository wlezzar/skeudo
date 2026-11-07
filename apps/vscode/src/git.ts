import { execFile, execFileSync } from 'node:child_process';
import { repoId } from '@skeudo/core';

/** Keeps git from running a command a repository's config names to watch the file system. */
const SAFE = ['-c', 'core.fsmonitor=false'];
const TIMEOUT = 3000;

/** How a file in a working tree compares with a revision. `missing` means the repository doesn't have the revision. */
export type FileState = 'same' | 'changed' | 'missing';

interface Result {
  status: number | null;
  stdout: string;
}

/** The repository names in `git config --get-regexp` output for remote URLs. */
function remoteIds(stdout: string): string[] {
  const ids = stdout.split('\n').map((line) => repoId(line.slice(line.indexOf(' ') + 1)));
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/**
 * Asks git about local repositories. The preview renders synchronously, so these calls are synchronous,
 * and answers are kept for a few seconds so rendering a document again doesn't run git again.
 */
export class Git {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(private readonly ttl = 10_000) {}

  private cached<T>(key: string, compute: () => T): T {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttl) return hit.value as T;
    const value = compute();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private run(args: string[]): Result {
    try {
      const stdout = execFileSync('git', [...SAFE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: TIMEOUT, windowsHide: true });
      return { status: 0, stdout };
    } catch (e) {
      const { status, stdout } = e as { status?: number | null; stdout?: string };
      return { status: status ?? null, stdout: stdout ?? '' };
    }
  }

  private runAsync(args: string[]): Promise<Result> {
    return new Promise((resolve) =>
      execFile('git', [...SAFE, ...args], { encoding: 'utf8', timeout: TIMEOUT, windowsHide: true }, (error, stdout) =>
        resolve({ status: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout: stdout ?? '' }),
      ),
    );
  }

  /** The root of the repository that holds `dir`. */
  toplevel(dir: string): string | undefined {
    return this.cached(`toplevel\0${dir}`, () => {
      const r = this.run(['-C', dir, 'rev-parse', '--show-toplevel']);
      return (r.status === 0 && r.stdout.trim()) || undefined;
    });
  }

  /** The names of a repository's remotes, as repoId gives them, such as `github.com/org/shop`. */
  remotes(root: string): string[] {
    return this.cached(`remotes\0${root}`, () => remoteIds(this.run(['-C', root, 'config', '--get-regexp', String.raw`^remote\..*\.url$`]).stdout));
  }

  /** The root and remotes of the repository that holds `dir`, without blocking. */
  async describe(dir: string): Promise<{ root: string; remotes: string[] } | undefined> {
    const top = await this.runAsync(['-C', dir, 'rev-parse', '--show-toplevel']);
    const root = top.status === 0 ? top.stdout.trim() : '';
    if (!root) return undefined;
    const config = await this.runAsync(['-C', root, 'config', '--get-regexp', String.raw`^remote\..*\.url$`]);
    return { root, remotes: remoteIds(config.stdout) };
  }

  /** How `path` in the working tree of `root` compares with `rev`, or undefined when git can't tell. */
  fileSince(root: string, rev: string, path: string): FileState | undefined {
    // The revision comes from a sketch: it must be a name, never an option.
    if (!/^\w[\w./~^+-]*$/.test(rev)) return undefined;
    return this.cached(`diff\0${root}\0${rev}\0${path}`, () => {
      const { status } = this.run(['-C', root, 'diff', '--quiet', '--no-ext-diff', '--no-textconv', rev, '--', path]);
      return status === 0 ? 'same' : status === 1 ? 'changed' : status === 128 ? 'missing' : undefined;
    });
  }
}
