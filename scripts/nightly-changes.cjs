'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function shanghaiDay(now) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return { date, start: new Date(`${date}T00:00:00+08:00`), end: new Date(`${date}T00:00:00+08:00`).getTime() + 86400000 };
}

function changedCommitsToday(root, now = new Date()) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const { start, end } = shanghaiDay(now);
  const log = git('log', '--first-parent', `--since-as-filter=${start.toISOString()}`, `--until=${now.toISOString()}`, '--format=%H %ct');
  return log.split('\n').filter(Boolean).filter((line) => {
    const [sha, timestamp] = line.split(' ');
    const time = Number(timestamp) * 1000;
    if (time < start.getTime() || time >= end || time > now.getTime()) return false;
    const [, parent] = git('rev-list', '--parents', '-n', '1', sha).split(' ');
    return Boolean(parent
      ? git('diff', '--name-only', parent, sha, '--')
      : git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha, '--'));
  }).map((line) => line.split(' ')[0]);
}

module.exports = { shanghaiDay, changedCommitsToday };
if (require.main === module) {
  const commits = changedCommitsToday(process.cwd());
  const build = commits.length > 0;
  const message = `${shanghaiDay(new Date()).date} (Asia/Shanghai): ${commits.length} commit(s) with file changes; ${build ? 'build' : 'skip'}.`;
  console.log(message);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `build=${build}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + '\n');
}
