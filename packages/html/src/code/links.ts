import type { Repo, ResolvedSrc } from '@skeudo/core';

/** A link for a source location, with a note for its tooltip, such as a warning that the lines may have moved. */
export interface SrcLink {
  href: string;
  note?: string;
}

/** The kinds of code hosts repoHref can link to. */
export type GitHost = 'github' | 'gitlab' | 'bitbucket';

/** A path in a URL, each part escaped. */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
/** A location's path, without a leading `./`. */
const relativePath = (loc: ResolvedSrc) => loc.path!.replace(/^(\.?\/)+/, '');

/** The lines of a location as a URL fragment, in the form each host reads: `#L88-L94`, `#L88-94` or `#lines-88:94`. */
function linesFragment(loc: ResolvedSrc, host: GitHost = 'github'): string {
  if (loc.start === undefined) return '';
  const end = loc.end !== undefined && loc.end !== loc.start ? loc.end : undefined;
  if (host === 'bitbucket') return `#lines-${loc.start}${end === undefined ? '' : `:${end}`}`;
  return `#L${loc.start}${end === undefined ? '' : host === 'gitlab' ? `-${end}` : `-L${end}`}`;
}

/**
 * A `srcHref` that links source locations under a base URL, such as a GitHub blob URL at a commit
 * (`https://github.com/org/repo/blob/a1b2c3d/`). Lines become a fragment, as in `#L88-L94`.
 */
export function srcBaseHref(base: string): (loc: ResolvedSrc) => string | undefined {
  const root = base.endsWith('/') ? base : `${base}/`;
  return (loc) => (loc.path ? root + encodePath(relativePath(loc)) + linesFragment(loc) : undefined);
}

const KNOWN_HOSTS: Record<string, GitHost> = { 'github.com': 'github', 'gitlab.com': 'gitlab', 'bitbucket.org': 'bitbucket' };

/**
 * Links a source location to the repository a sketch names with `::repo`. A remote on GitHub, GitLab or
 * Bitbucket links to the file on that host at the revision, or at the default branch without one; give
 * other servers of those kinds in `hosts`. A `git+file://` folder links with a `file://` URL, and any
 * other URL is a base that the path is added to. Returns undefined for a host it doesn't know.
 */
export function repoHref(repo: Repo, loc: ResolvedSrc, hosts: Record<string, GitHost> = {}): string | undefined {
  if (!loc.path) return undefined;
  if (repo.type === 'base') return srcBaseHref(repo.url)(loc);
  if (repo.type === 'local') {
    // Keep a Windows drive, as in `file:///C:/code`, unescaped.
    const folder = repo.path.split('/').map((part, i) => (i === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)));
    return srcBaseHref(`file://${repo.path.startsWith('/') ? '' : '/'}${folder.join('/')}`)(loc);
  }
  const host = hosts[repo.host] ?? KNOWN_HOSTS[repo.host];
  if (!host) return undefined;
  const rev = encodePath(repo.rev ?? 'HEAD');
  const view = host === 'github' ? 'blob' : host === 'gitlab' ? '-/blob' : 'src';
  return `https://${repo.host}/${encodePath(repo.path)}/${view}/${rev}/${encodePath(relativePath(loc))}${linesFragment(loc, host)}`;
}
