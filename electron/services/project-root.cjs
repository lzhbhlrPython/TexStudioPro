'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { IGNORED_DIRS } = require('./project-files.cjs');

function readConfig(root) {
  const file = path.join(root, '.texpro', 'project.json');
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid .texpro/project.json');
  return value;
}

function isMain(text) {
  return /\\documentclass\b/.test(text.replace(/(^|[^\\])%.*/gm, '$1'));
}

function validateMain(root, file) {
  const resolved = path.resolve(root, file);
  const realRoot = fs.realpathSync(root);
  if (!/\.(tex|ltx)$/i.test(resolved) || !fs.statSync(resolved).isFile() || !fs.realpathSync(resolved).startsWith(realRoot + path.sep)) throw new Error('Main file must be a .tex/.ltx file inside this project.');
  if (!isMain(fs.readFileSync(resolved, 'utf8'))) throw new Error('Main file must contain an uncommented \\documentclass.');
  return resolved;
}

function resolveProjectRoot(root) {
  const candidates = [];
  const visit = (dir, depth) => {
    if (depth > 5) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && /\.(tex|ltx)$/i.test(file)) {
        try { if (isMain(fs.readFileSync(file, 'utf8'))) candidates.push(file); } catch { /* unreadable files cannot be main files */ }
      }
    }
  };
  visit(path.resolve(root), 0);
  candidates.sort();
  try {
    const config = readConfig(root);
    if (Object.hasOwn(config, 'rootFile') && (typeof config.rootFile !== 'string' || !config.rootFile.trim())) throw new Error('rootFile must be a non-empty relative path.');
    if (config.rootFile) {
      const main = validateMain(root, config.rootFile);
      if (!candidates.includes(main)) { candidates.push(main); candidates.sort(); }
      return { rootFile: main, rootCandidates: candidates, rootSource: 'configured', rootError: null };
    }
    if (candidates.length === 1) return { rootFile: candidates[0], rootCandidates: candidates, rootSource: 'detected', rootError: null };
    return { rootFile: null, rootCandidates: candidates, rootSource: candidates.length ? 'ambiguous' : 'missing', rootError: candidates.length ? 'Multiple main files found. Choose the project main file.' : 'No main file containing \\documentclass found.' };
  } catch (error) {
    return { rootFile: null, rootCandidates: candidates, rootSource: 'invalid', rootError: `Project main file configuration is invalid: ${error.message}` };
  }
}

function resolveCompileRoot(projectRoot, _activeFile, explicitRoot) {
  const project = resolveProjectRoot(projectRoot);
  if (project.rootSource === 'invalid') throw new Error(project.rootError);
  if (project.rootSource === 'configured') return project.rootFile;
  // A caller may explicitly select an entry, but changing the editor tab may
  // never override the project's chosen document.
  if (explicitRoot) return validateMain(projectRoot, explicitRoot);
  if (!project.rootFile) throw new Error(project.rootError);
  return project.rootFile;
}

function rebaseConfiguredRoot(root, oldPath, newPath) {
  const config = readConfig(root);
  if (!config.rootFile) return;
  const current = path.resolve(root, config.rootFile);
  if (current !== oldPath && !current.startsWith(oldPath + path.sep)) return;
  config.rootFile = path.relative(root, newPath + current.slice(oldPath.length)).replaceAll('\\', '/');
  fs.writeFileSync(path.join(root, '.texpro', 'project.json'), JSON.stringify(config, null, 2));
}

module.exports = { readConfig, validateMain, resolveProjectRoot, resolveCompileRoot, rebaseConfiguredRoot };
