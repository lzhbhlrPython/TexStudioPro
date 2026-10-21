'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { changedCommitsToday } = require('../scripts/nightly-changes.cjs');
const now = new Date('2026-10-21T03:17:00Z');

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-nightly-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args, date = '2026-10-20T15:59:59Z', author = date) => execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: author, GIT_COMMITTER_DATE: date }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git(['init', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'source.tex'), 'initial');
  git(['add', '.']); git(['commit', '-m', 'initial']);
  return { root, git };
}

test('nightly skips yesterday and empty commits today', (t) => {
  const { root, git } = repository(t);
  assert.deepEqual(changedCommitsToday(root, now), []);
  git(['commit', '--allow-empty', '-m', 'empty'], '2026-10-21T01:00:00Z');
  assert.deepEqual(changedCommitsToday(root, now), []);
});

test('nightly counts Shanghai midnight by committer time, including old authored changes', (t) => {
  const { root, git } = repository(t);
  fs.writeFileSync(path.join(root, 'source.tex'), 'changed'); git(['add', '.']);
  git(['commit', '-m', 'change'], '2026-10-20T16:00:00Z', '2026-10-19T10:00:00Z');
  assert.deepEqual(changedCommitsToday(root, now), [git(['rev-parse', 'HEAD'])]);
});

test('nightly ignores future dated commits', (t) => {
  const { root, git } = repository(t);
  fs.writeFileSync(path.join(root, 'source.tex'), 'future'); git(['add', '.']);
  git(['commit', '-m', 'change'], '2026-10-22T01:00:00Z');
  assert.deepEqual(changedCommitsToday(root, now), []);
});

test('nightly counts a merge today when its first-parent tree changed', (t) => {
  const { root, git } = repository(t);
  git(['checkout', '-b', 'feature']);
  fs.writeFileSync(path.join(root, 'source.tex'), 'feature'); git(['add', '.']); git(['commit', '-m', 'feature']);
  git(['checkout', 'main']); git(['merge', '--no-ff', 'feature', '-m', 'merge'], '2026-10-21T01:00:00Z');
  assert.deepEqual(changedCommitsToday(root, now), [git(['rev-parse', 'HEAD'])]);
});
