'use strict';
const fs = require('node:fs');
const path = require('node:path');

function verifyContents(read, files) {
  const required = ['package.json', 'electron/main.cjs', 'electron/preload.cjs', 'mcp/server.mjs', 'dist/index.html', ...['tex', 'history', 'git', 'project-files', 'project-root', 'music'].map((name) => `electron/services/${name}.cjs`)];
  for (const file of required) if (!files.has(file)) throw new Error(`Release is missing ${file}. Run npm run build before packaging.`);
  const html = read('dist/index.html').toString();
  const assets = [...html.matchAll(/(?:src|href)=["'](?:\.\/)?(assets\/[^"']+)["']/g)].map((match) => `dist/${match[1]}`);
  if (!assets.some((file) => file.endsWith('.js')) || !assets.some((file) => file.endsWith('.css'))) throw new Error('Renderer entry scripts/styles are missing.');
  for (const asset of assets) if (!files.has(asset)) throw new Error(`Release references a missing asset: ${asset}`);
  if (![...files].some((file) => /^dist\/assets\/pdf\.worker.*\.mjs$/.test(file))) throw new Error('Release is missing the PDF worker.');
  if ([...files].some((file) => /(?:^|\/)(?:\.ai-notes|superpowers)(?:\/|$)/.test(file))) throw new Error('Private working notes must not enter a release.');
  return { entryAssets: assets.length, files: files.size };
}

function verifyDirectory(root) {
  verifyExternalResources(root);
  const files = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative); else files.add(relative);
    }
  };
  for (const name of ['dist', 'electron', 'mcp']) if (fs.existsSync(path.join(root, name))) walk(name);
  if (fs.existsSync(path.join(root, 'package.json'))) files.add('package.json');
  return verifyContents((file) => fs.readFileSync(path.join(root, file)), files);
}

function verifyArchive(archive) {
  const asar = require('@electron/asar');
  const files = new Set(asar.listPackage(archive).map((file) => file.replace(/^[/\\]+/, '').replaceAll('\\', '/')));
  return verifyContents((file) => asar.extractFile(archive, file), files);
}

function verifyExternalResources(root) {
  for (const file of ['mcp/server.mjs', ...['tex', 'history', 'git', 'project-files', 'project-root', 'music'].map((name) => `electron/services/${name}.cjs`)]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Release is missing external MCP dependency: ${file}`);
  }
}

function verifyPackagedApp(archive) {
  verifyExternalResources(archive + '.unpacked');
  return verifyArchive(archive);
}

module.exports = { verifyContents, verifyDirectory, verifyArchive, verifyExternalResources, verifyPackagedApp };
if (require.main === module) {
  try {
    const target = path.resolve(process.argv[2] || '.');
    console.log('[release] verified', target.endsWith('.asar') ? verifyPackagedApp(target) : verifyDirectory(target));
  } catch (error) { console.error('[release]', error.message); process.exitCode = 1; }
}
