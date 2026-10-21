'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tex = require('../electron/services/tex.cjs');
const { resolveProjectRoot, resolveCompileRoot } = require('../electron/services/project-root.cjs');
const main = '\\documentclass{article}\n\\begin{document}\nTest\n\\end{document}\n';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpro-main-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true}); fs.writeFileSync(path.join(root, file), text); return path.join(root,file); };
  return { root, write, config: value => write('.texpro/project.json', JSON.stringify(value)) };
}
test('unique documentclass is detected; commented examples and build output are ignored', t => {
  const {root,write} = fixture(t);
  const file = write('paper.ltx', main);
  write('chapter.tex','% \\documentclass{book}\nA chapter');
  write('build/main.tex', main); write('.texpro/temp.tex',main);
  assert.equal(resolveProjectRoot(root).rootSource, 'detected');
  assert.deepEqual(resolveProjectRoot(root).rootCandidates,[file]);
  assert.equal(resolveCompileRoot(root,path.join(root,'chapter.tex')),file);
});
test('multiple mains stay ambiguous until explicitly pinned; editing another document cannot override it', t => {
  const {root,write,config} = fixture(t);
  const first=write('one.tex',main), second=write('two.tex',main);
  assert.equal(resolveProjectRoot(root).rootFile,null);
  assert.throws(()=>resolveCompileRoot(root,first),/Multiple main/);
  config({rootFile:'two.tex',custom:'preserve'});
  write('chapter.tex','% !TeX root = one.tex\nA chapter');
  assert.equal(tex.openProject(root).rootSource,'configured');
  assert.equal(resolveCompileRoot(root,first,first),second);
  assert.equal(resolveCompileRoot(root,path.join(root,'chapter.tex')),second);
});
test('missing, corrupt, escaped and non-main settings fail without silent fallback', async t => {
  const {root,write,config} = fixture(t); write('valid.tex',main); write('chapter.tex','A chapter');
  for (const rootFile of ['missing.tex','chapter.tex','../elsewhere.tex',42,'']) {
    config({rootFile});
    assert.equal(resolveProjectRoot(root).rootSource,'invalid');
    const result = await tex.runCompile({projectRoot:root, activeFile:path.join(root,'valid.tex')});
    assert.equal(result.ok,false); assert.match(result.error,/invalid/i);
  }
  write('.texpro/project.json','{broken');
  assert.equal(resolveProjectRoot(root).rootFile,null);
});
test('main-file identity follows file and enclosing directory renames and moves', t => {
  const {root,write,config} = fixture(t); const first=write('draft/paper.tex',main);
  config({rootFile:'draft/paper.tex',custom:{keep:true}});
  const renamed=tex.renameProjectFile(root,first,'thesis.tex');
  assert.equal(resolveProjectRoot(root).rootFile,renamed.path);
  tex.moveProjectDirectory(root,path.join(root,'draft'),'final');
  assert.equal(resolveProjectRoot(root).rootFile,path.join(root,'final/thesis.tex'));
  fs.mkdirSync(path.join(root,'documents'));
  const moved=tex.moveProjectFile(root,path.join(root,'final/thesis.tex'),path.join(root,'documents'));
  assert.equal(resolveProjectRoot(root).rootFile,moved.path);
  const value=JSON.parse(fs.readFileSync(path.join(root,'.texpro/project.json')));
  assert.equal(value.rootFile,'documents/thesis.tex'); assert.deepEqual(value.custom,{keep:true});
});
test('deleting a pinned main never promotes a different document', t => {
  const {root,write,config} = fixture(t); const file=write('selected.tex',main); write('other.tex',main);
  config({rootFile:'selected.tex'}); fs.unlinkSync(file);
  const info=tex.openProject(root);
  assert.equal(info.rootFile,null); assert.equal(info.rootSource,'invalid');
  assert.equal(info.rootCandidates.length,1);
});

test('custom toolchain actions expand the current main and build directory on the service', async t => {
  const {root,write,config}=fixture(t); write('paper.tex',main); const other=write('other.tex',main);
  config({rootFile:'paper.tex',directories:{build:'output'}});
  const result=await tex.runProjectAction(root,{command:process.execPath,args:['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','{rootFile}','{rootName}','{buildDir}']},other);
  assert.equal(result.ok,true);
  assert.deepEqual(JSON.parse(result.stdout),['paper.tex','paper','output']);
});
