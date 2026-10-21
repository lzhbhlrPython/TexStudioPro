'use strict';
const path = require('node:path');

const IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.texpro', 'dist', 'release',
  '__pycache__', '.DS_Store', '.idea', '.vscode', 'build', 'out',
]);

const TEXT_EXTENSIONS = new Set([
  '.tex', '.ltx', '.bib', '.cls', '.sty', '.bst', '.txt', '.md', '.json',
  '.yaml', '.yml', '.toml', '.csv', '.cfg', '.def', '.clo', '.fd', '.lua',
]);

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

module.exports = { IGNORED_DIRS, TEXT_EXTENSIONS, isTextFile };
