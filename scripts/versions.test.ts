import { describe, expect, test } from 'vitest';
import { compareVersions, nextVersion, parseVersion, releaseNotes, type Commit } from './versions.mts';

const commit = (subject: string, sha = 'abcdef0123456789abcdef0123456789abcdef01'): Commit => ({ sha, subject });
const REPO = 'https://github.com/someone/skeudo';

describe('parseVersion', () => {
  test('reads X.Y.Z, with or without a v', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0]);
    expect(parseVersion('v1.10.3')).toEqual([1, 10, 3]);
  });

  test('refuses anything else', () => {
    for (const text of ['0.2', '0.2.0-beta.1', '01.2.0', 'vscode-v0.1.0', ' 0.2.0', '']) expect(parseVersion(text)).toBeNull();
  });
});

test('compareVersions orders by number, not by text', () => {
  const sorted = ['0.10.0', 'v0.2.0', '0.2.1', '1.0.0', '0.9.9'].sort(compareVersions);
  expect(sorted).toEqual(['v0.2.0', '0.2.1', '0.9.9', '0.10.0', '1.0.0']);
  expect(compareVersions('v0.2.0', '0.2.0')).toBe(0);
});

describe('nextVersion', () => {
  test('before 1.0, a format change makes a minor version, anything else a patch', () => {
    expect(nextVersion('v0.1.3', [commit('fix: A'), commit('feat!: B')])).toBe('0.2.0');
    expect(nextVersion('v0.1.3', [commit('fix: A'), commit('feat: B')])).toBe('0.1.4');
  });

  test('from 1.0, a format change makes a major version, a feat a minor one', () => {
    expect(nextVersion('v1.2.3', [commit('feat!: A')])).toBe('2.0.0');
    expect(nextVersion('v1.2.3', [commit('feat: A'), commit('fix: B')])).toBe('1.3.0');
    expect(nextVersion('v1.2.3', [commit('fix: A')])).toBe('1.2.4');
  });

  test('only ! right before the colon marks a format change', () => {
    expect(nextVersion('v0.1.0', [commit('feat: Add a ! to the syntax!: now')])).toBe('0.1.1');
  });
});

describe('releaseNotes', () => {
  test('lists the subjects without their types, oldest first, with short hashes', () => {
    const notes = releaseNotes({ version: '0.1.1', previous: 'v0.1.0', repo: REPO, commits: [commit('fix: Keep A, so B.', '1234567aaa'), commit('feat: Add C.', '89abcdefff')] });
    expect(notes).toBe(`- Keep A, so B. (1234567)\n- Add C. (89abcde)\n\nAll changes: ${REPO}/compare/v0.1.0...v0.1.1`);
  });

  test('puts format changes first, under their own heading', () => {
    const notes = releaseNotes({ version: '0.2.0', previous: 'v0.1.0', repo: REPO, commits: [commit('fix: A.', '1111111'), commit('feat!: B.', '2222222')] });
    expect(notes).toBe(
      `**Format changes**, which break existing sketches:\n\n- B. (2222222)\n\n**Other changes**:\n\n- A. (1111111)\n\nAll changes: ${REPO}/compare/v0.1.0...v0.2.0`,
    );
  });

  test('says when no commit changed the packages', () => {
    expect(releaseNotes({ version: '0.1.1', previous: 'v0.1.0', repo: REPO, commits: [] })).toBe(
      `No change to the packages since v0.1.0.\n\nAll changes: ${REPO}/compare/v0.1.0...v0.1.1`,
    );
  });

  test('the first release has no commits to list', () => {
    expect(releaseNotes({ version: '0.1.0', previous: null, repo: REPO, commits: [commit('feat: A.')] })).toBe('The first release.');
  });
});
