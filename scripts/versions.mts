// The rules of a release that need neither git nor the network: reading versions, the version a list of
// commits calls for, and the release notes. scripts/release.mts uses them, and scripts/versions.test.ts
// checks them.

/** A commit that changed a published package. */
export type Commit = { sha: string; subject: string };

/** `0.2.0` or `v0.2.0` as [major, minor, patch], or null for anything else. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative when `a` comes before `b`, positive after, 0 when equal. Both must parse. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parseVersion(a)!, parseVersion(b)!];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** A format change has `!` after its type, as in `feat!: Rename …`. */
export const isFormatChange = (subject: string) => /^[a-z]+!:/.test(subject);

/**
 * The version after `last` that `commits` call for. Until 1.0, a format change makes a minor version and
 * anything else a patch, since the format breaks sketches in minor versions. From 1.0, a format change
 * makes a major version, a `feat` a minor one, and anything else a patch.
 */
export function nextVersion(last: string, commits: Commit[]): string {
  const [major, minor, patch] = parseVersion(last)!;
  if (commits.some((c) => isFormatChange(c.subject))) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (major > 0 && commits.some((c) => /^feat:/.test(c.subject))) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * The release notes, in Markdown: each commit's subject without its type, format changes first. `previous`
 * is the release before, or null for the first one. `repo` is the GitHub URL, for the link to the diff.
 */
export function releaseNotes({ version, previous, commits, repo }: { version: string; previous: string | null; commits: Commit[]; repo: string }): string {
  if (!previous) return 'The first release.';
  const line = (c: Commit) => `- ${c.subject.replace(/^[a-z]+!?:\s*/, '')} (${c.sha.slice(0, 7)})`;
  const format = commits.filter((c) => isFormatChange(c.subject)).map(line);
  const other = commits.filter((c) => !isFormatChange(c.subject)).map(line);
  const parts = [];
  if (!commits.length) parts.push(`No change to the packages since ${previous}.`);
  else if (!format.length) parts.push(other.join('\n'));
  else {
    parts.push(`**Format changes**, which break existing sketches:\n\n${format.join('\n')}`);
    if (other.length) parts.push(`**Other changes**:\n\n${other.join('\n')}`);
  }
  parts.push(`All changes: ${repo}/compare/${previous}...v${version}`);
  return parts.join('\n\n');
}
