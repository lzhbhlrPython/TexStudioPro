'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const m=require('../tests/helpers/music.cjs');
const tex=require('../electron/services/tex.cjs');
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'texpro-music-compile-'));
  try {
    const cases=m.musicTemplates.map(t=>[t.id,t.score]);
    const complex=m.newScore('choir');complex.title='春之和声';complex.meter=[3,4];complex.parts[0].notes=[{pitch:4,duration:4,dotted:true,chord:[7,9],harmony:'Cmaj7',dynamic:'mf',lyric:'春'},{pitch:4,duration:1,tie:true},{pitch:4,duration:2},{pitch:null,duration:8,dotted:true}];
    const chord=m.newScore();chord.meter=[3,4];chord.parts[0].notes=[{pitch:0,chord:[2,4],duration:1,dotted:true}];
    cases.push(['complex-cjk',complex],['part',{...complex,display:2}],['tied-chord',chord]);
    for(const [name,score] of cases){
      const project=path.join(root,name);fs.mkdirSync(project);
      fs.writeFileSync(path.join(project,'main.tex'),m.previewDocument(m.musicBlock(score)));
      const result=await tex.runCompile({projectRoot:project,timeoutMs:45000});
      assert.ok(result.ok,`${name}: ${result.error}\n${result.log.slice(-3000)}`);
      if(score.kind==='staff')assert.ok(fs.existsSync(path.join(project,'.texpro/build/main.mx2')));
      console.log('PASS real TeX score:',name);
    }
    const source=m.previewDocument(m.generateMusic(m.newScore('piano')));
    const previews=await Promise.all([1,2].map(()=>tex.renderMusicPreview({projectRoot:root,source,runId:'music-'+crypto.randomUUID()})));
    for(const r of previews){assert.ok(r.ok,r.error);assert.equal(Buffer.from(r.bytes).subarray(0,4).toString(),'%PDF');}
    assert.equal(fs.readdirSync(path.join(root,'.texpro/music-previews')).filter(p=>p.startsWith('build-')).length,0);
    console.log('PASS concurrent preview jobs publish complete PDFs and remove build directories');
    const bad=await tex.renderMusicPreview({projectRoot:root,source:source.replace('\\end{document}','\\undefinedMusicCommand\n\\end{document}'),runId:'music-'+crypto.randomUUID()});assert.equal(bad.ok,false);
    assert.equal(fs.readdirSync(path.join(root,'.texpro/music-previews')).filter(p=>p.endsWith('.pdf')).length,1);
    const main=path.join(root,'cancel');fs.mkdirSync(main);fs.writeFileSync(path.join(main,'main.tex'),'\\documentclass{article}\n\\begin{document}\n\\newcount\\slow\\loop\\advance\\slow by1\\ifnum\\slow<2147483647\\repeat\n\\end{document}');
    const running=tex.runCompile({projectRoot:main,runId:'main-cancel',timeoutMs:30000});
    const preview=tex.renderMusicPreview({projectRoot:root,source:m.previewDocument(m.generateMusic(m.newScore('melody'))),runId:'music-'+crypto.randomUUID()});
    await new Promise(resolve=>setTimeout(resolve,250));assert.equal(tex.cancelCompilation().ok,true);
    assert.equal((await running).cancelled,true);assert.equal((await preview).ok,true);
    console.log('PASS a failed preview is not cached; cancelling main compilation preserves inline preview');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
