import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoId, type ResolvedSrc, type Sketch } from '@skeudo/core';
import { repoHref, srcBaseHref, type GitHost, type SrcLink } from '@skeudo/html';
import type { Git } from './git';

/** What source links need from VS Code, given as functions so they read the current state. */
export interface LinkContext {
  /** Git, or undefined when the workspace isn't trusted, so no git command runs. */
  git(): Git | undefined;
  /** The `skeudo.repositories` setting: repository → local folder. */
  repositories(): Record<string, string>;
  /** The `skeudo.gitHosts` setting. */
  gitHosts(): Record<string, GitHost>;
  /** Folders open in this window. */
  workspaceFolders(): string[];
  /** Repositories open in any window since the extension started recording them: repository → local folder. */
  remembered(): Record<string, string>;
}

/** The path of the document being previewed, from the env VS Code's preview gives markdown-it. */
export function documentPath(env: Record<string, unknown>): string | undefined {
  const doc = env.currentDocument as { scheme?: string; fsPath?: string } | undefined;
  return doc?.scheme === 'file' ? doc.fsPath : undefined;
}

/**
 * Links a sketch without `::repo` from the workspace folder: the preview resolves a path that starts with
 * `/` from the workspace folder holding the document, and opens `#L88-L94` with those lines selected.
 */
export const workspaceHref = srcBaseHref('/');

/**
 * Links a location in `folder` with a path relative to the document. The preview resolves that from the
 * document's folder, whatever the workspace, and opens the file in the editor. Undefined on another drive.
 */
function folderHref(doc: string, folder: string, loc: ResolvedSrc): string | undefined {
  const rel = relative(dirname(doc), folder);
  if (isAbsolute(rel)) return undefined;
  return srcBaseHref(rel ? rel.split(sep).map(encodeURIComponent).join('/') : '.')(loc);
}

const expandHome = (path: string) => (path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path);
/** A `skeudo.repositories` key, which may be written as a URL or as `github.com/org/shop`. */
const settingId = (key: string) => repoId(key) ?? key.trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');

/**
 * The local copy of a repository: from the setting, then the repository holding the document, then the
 * folders open in this window, then repositories opened in other windows.
 */
function findCopy(ctx: LinkContext, id: string, doc: string | undefined): string | undefined {
  for (const [key, folder] of Object.entries(ctx.repositories())) {
    const path = expandHome(folder);
    if (settingId(key) === id && existsSync(path)) return path;
  }
  const git = ctx.git();
  if (git) {
    for (const dir of [...(doc ? [dirname(doc)] : []), ...ctx.workspaceFolders()]) {
      const root = git.toplevel(dir);
      if (root && git.remotes(root).includes(id)) return root;
    }
  }
  const known = ctx.remembered()[id];
  return known && existsSync(known) ? known : undefined;
}

/** A warning for a link into a local copy whose file may not match the sketch's revision. */
function revisionNote(ctx: LinkContext, folder: string, rev: string, loc: ResolvedSrc): string | undefined {
  const path = loc.path!.replace(/^(\.?\/)+/, '');
  const state = ctx.git()?.fileSince(folder, rev, path);
  if (state === 'changed') return `${path} has changed since ${rev}, so the lines may have moved.`;
  if (state === 'missing') return `${folder} doesn't have ${rev}, so the lines may have moved.`;
  return undefined;
}

/**
 * Builds the preview's links for `::src` locations. A sketch that names its repository with `::repo` links
 * to a local copy, with a path relative to the document, and warns when the file has changed since the
 * sketch's revision. Without a local copy, it links to the file on the repository's host.
 */
export function createSrcHref(ctx: LinkContext) {
  return (loc: ResolvedSrc, sketch: Sketch, env: Record<string, unknown>): string | SrcLink | undefined => {
    if (!loc.path) return undefined;
    const { repo } = sketch;
    if (!repo) return workspaceHref(loc);
    const doc = documentPath(env);
    if (repo.type === 'base') {
      // The preview doesn't open file: links, so a file: base becomes a relative path too.
      if (doc && /^file:\/\//i.test(repo.url)) {
        try {
          return folderHref(doc, fileURLToPath(repo.url), loc);
        } catch {
          return undefined;
        }
      }
      return repoHref(repo, loc, ctx.gitHosts());
    }
    const id = repo.type === 'remote' ? repoId(repo.remote) : undefined;
    const folder = repo.type === 'local' ? (existsSync(repo.path) ? repo.path : undefined) : id && findCopy(ctx, id, doc);
    const href = doc && folder ? folderHref(doc, folder, loc) : undefined;
    if (!href) return repo.type === 'remote' ? repoHref(repo, loc, ctx.gitHosts()) : undefined;
    const note = repo.rev ? revisionNote(ctx, folder!, repo.rev, loc) : undefined;
    return note ? { href, note } : href;
  };
}
