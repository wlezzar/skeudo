import type { ResolvedSrc } from '@sketch/core';

/**
 * Links a `::src` location to its file. The Markdown preview resolves a path starting with `/` from the
 * workspace folder, and opens `#L88-L94` with those lines selected. Sketch paths are relative to the
 * repository root, so this assumes the workspace folder is the repository.
 */
export function srcHref(loc: ResolvedSrc): string | undefined {
  if (!loc.path) return undefined;
  const path = loc.path.replace(/^(\.?\/)+/, '').split('/').map(encodeURIComponent).join('/');
  let href = `/${path}`;
  if (loc.start !== undefined) href += `#L${loc.start}`;
  if (loc.start !== undefined && loc.end !== undefined && loc.end !== loc.start) href += `-L${loc.end}`;
  return href;
}
