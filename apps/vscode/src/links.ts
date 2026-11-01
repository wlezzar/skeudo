import { srcBaseHref } from '@skeudo/html';

/**
 * Links a `::src` location to its file. The Markdown preview resolves a path starting with `/` from the
 * workspace folder, and opens `#L88-L94` with those lines selected. Sketch paths are relative to the
 * repository root, so this assumes the workspace folder is the repository.
 */
export const srcHref = srcBaseHref('/');
