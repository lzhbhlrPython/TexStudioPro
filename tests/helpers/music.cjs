const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { exports: {}, structuredClone, crypto: require('node:crypto').webcrypto, btoa, atob, unescape, escape, encodeURIComponent, decodeURIComponent };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../src/lib/music.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
module.exports = context.exports;
