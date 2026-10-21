'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function runGit(args, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: null, stdout, stderr: stderr + String(error) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

async function gitStatus(projectRoot) {
  const root = path.resolve(projectRoot);
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], root);
  if (inside.code !== 0) return { initialized: false, branch: '', changes: [], ahead: 0, behind: 0 };
  const branch = await runGit(['branch', '--show-current'], root);
  const status = await runGit(['status', '--porcelain=v1', '-b'], root);
  const lines = status.stdout.split('\n').filter(Boolean);
  const summary = lines[0] || '';
  const changes = lines.slice(1).map((line) => ({ status: line.slice(0, 2).trim(), file: line.slice(3) }));
  const ahead = Number((summary.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = Number((summary.match(/behind (\d+)/) || [])[1] || 0);
  const log = await runGit(['log', '--oneline', '-8'], root);
  return {
    initialized: true,
    branch: branch.stdout.trim(),
    changes,
    ahead,
    behind,
    commits: log.stdout.split('\n').filter(Boolean).map((line) => {
      const [hash, ...rest] = line.split(' ');
      return { hash, subject: rest.join(' ') };
    }),
  };
}

async function gitInit(projectRoot) {
  const result = await runGit(['init'], path.resolve(projectRoot));
  if (result.code !== 0) throw new Error(result.stderr || 'git init failed');
  return { ok: true };
}

async function gitCommit(projectRoot, message) {
  const root = path.resolve(projectRoot);
  await runGit(['add', '-A'], root);
  const result = await runGit(['commit', '-m', String(message || 'Update from TeXPro')], root);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'git commit failed');
  return { ok: true, output: result.stdout };
}

async function gitPull(projectRoot) {
  const result = await runGit(['pull', '--ff-only'], path.resolve(projectRoot), 120000);
  if (result.code !== 0) throw new Error(result.stderr || 'git pull failed');
  return { ok: true, output: result.stdout };
}

async function gitPush(projectRoot) {
  const result = await runGit(['push'], path.resolve(projectRoot), 120000);
  if (result.code !== 0) throw new Error(result.stderr || 'git push failed');
  return { ok: true, output: result.stdout };
}

async function overleafClone(url) {
  const target = String(url || '').trim();
  if (!/^https:\/\/git\.overleaf\.com\/[A-Za-z0-9_-]+(?:\.git)?\/?$/.test(target)) throw new Error('Enter an Overleaf Git URL: https://git.overleaf.com/<project-id>');
  const id = target.replace(/\/$/, '').split('/').pop();
  const parent = path.join(require('node:os').homedir(), 'Documents', 'TeXPro Projects');
  fs.mkdirSync(parent, { recursive: true });
  const destination = path.join(parent, `overleaf-${id}`);
  if (fs.existsSync(destination)) throw new Error('That Overleaf project is already cloned in ~/Documents/TeXPro Projects');
  const result = await runGit(['clone', '--depth', '1', target, destination], parent, 180000);
  if (result.code !== 0) throw new Error(result.stderr || 'git clone failed');
  return { path: destination };
}


module.exports = { gitStatus, gitInit, gitCommit, gitPull, gitPush, overleafClone };
