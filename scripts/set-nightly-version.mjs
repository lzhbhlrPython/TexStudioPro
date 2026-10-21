import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const base = String(pkg.version).replace(/-nightly\..*$/, '');
const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
pkg.version = `${base}-nightly.${date}`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

// Keep the lockfile root metadata aligned without touching dependency resolution.
try {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  lock.version = pkg.version;
  if (lock.packages?.['']) lock.packages[''].version = pkg.version;
  fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
} catch {
  // package-lock.json is optional for the build.
}

console.log(`Nightly version: ${pkg.version}`);
