import { describe, expect, test } from 'vitest';
import { parseRepo, repoId } from '../src';

describe('parseRepo', () => {
  test('reads a remote and the revision after the last @ of its path', () => {
    expect(parseRepo('git+https://github.com/org/shop@a1b2c3d')).toEqual({
      type: 'remote',
      url: 'git+https://github.com/org/shop@a1b2c3d',
      remote: 'https://github.com/org/shop',
      host: 'github.com',
      path: 'org/shop',
      rev: 'a1b2c3d',
    });
  });

  test('keeps the user of an ssh remote, and drops the port and a trailing .git from the host and path', () => {
    expect(parseRepo('git+ssh://git@GitLab.example.com:2222/team/shop.git@v1.2')).toMatchObject({
      type: 'remote',
      remote: 'ssh://git@GitLab.example.com:2222/team/shop.git',
      host: 'gitlab.example.com',
      path: 'team/shop',
      rev: 'v1.2',
    });
  });

  test('takes a branch with slashes as the revision, and makes the revision optional', () => {
    expect(parseRepo('git+https://github.com/org/shop@feature/refunds')).toMatchObject({ path: 'org/shop', rev: 'feature/refunds' });
    expect(parseRepo('git+https://github.com/org/shop')).toEqual({
      type: 'remote',
      url: 'git+https://github.com/org/shop',
      remote: 'https://github.com/org/shop',
      host: 'github.com',
      path: 'org/shop',
    });
  });

  test('reads a folder on this machine', () => {
    expect(parseRepo('git+file:///home/me/my%20shop@a1b2c3d')).toEqual({
      type: 'local',
      url: 'git+file:///home/me/my%20shop@a1b2c3d',
      path: '/home/me/my shop',
      rev: 'a1b2c3d',
    });
    expect(parseRepo('git+file:///home/me/shop/')).toMatchObject({ path: '/home/me/shop' });
    expect(parseRepo('git+file:///C:/code/shop@a1b2c3d')).toMatchObject({ path: 'C:/code/shop' });
  });

  test('uses any other URL as a base', () => {
    expect(parseRepo(' https://code.example.com/shop/blob/a1b2c3d/ ')).toEqual({ type: 'base', url: 'https://code.example.com/shop/blob/a1b2c3d/' });
    expect(parseRepo('file:///home/me/shop')).toEqual({ type: 'base', url: 'file:///home/me/shop' });
  });

  test('rejects notes that are not URLs', () => {
    for (const note of ['', 'shop', 'github.com/org/shop', 'git@github.com:org/shop.git', 'git+github.com/org/shop', 'C:\\code\\shop', 'git+https://', 'git+file://%zz']) {
      expect(parseRepo(note), note).toBeUndefined();
    }
  });
});

describe('repoId', () => {
  test('names a repository the same way however it was cloned', () => {
    for (const remote of [
      'https://github.com/org/shop',
      'https://github.com/Org/Shop.git',
      'ssh://git@github.com/org/shop.git',
      'git@github.com:org/shop.git',
      'git+https://github.com/org/shop',
      'https://user:token@github.com:443/org/shop/',
    ]) {
      expect(repoId(remote), remote).toBe('github.com/org/shop');
    }
  });

  test('gives nothing for local paths', () => {
    for (const remote of ['/home/me/shop', '../shop', 'file:///home/me/shop', 'C:\\code\\shop', 'C:/code/shop']) {
      expect(repoId(remote), remote).toBeUndefined();
    }
  });
});
