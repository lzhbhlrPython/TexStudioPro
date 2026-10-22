'use strict';
const fs = require('node:fs');
const path = require('node:path');
/** TeX Live supplies musixflx.lua. Invoke it directly, without shell escape or another score engine. */
async function musicSpacing({ buildDir, jobName, before, run, resolveScript }) {
  const file = path.join(buildDir, jobName + '.mx1');
  if (!fs.existsSync(file)) return null;
  const data = fs.readFileSync(file, 'utf8');
  if ((data === before && fs.existsSync(path.join(buildDir, jobName + '.mx2'))) || data.trim().split(/\r?\n/).length < 2) return null;
  const script = await resolveScript();
  if (!script) return { code: 1, error: new Error('Install the musixtex package in TeX Live or MiKTeX to engrave scores.'), stdout: '', stderr: 'MusiXTeX spacing needs musixflx.lua. Install the musixtex package in TeX Live or MiKTeX.' };
  return run('texlua', [script, path.join(buildDir, jobName)], buildDir);
}
module.exports = { musicSpacing };
