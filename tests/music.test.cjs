'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const m = require('./helpers/music.cjs');
const { musicSpacing } = require('../electron/services/music.cjs');

test('music survives a Unicode source roundtrip and manual edits remain authoritative', () => {
  const score = m.newScore('choir');
  score.title = '四声部 & 合唱'; score.parts[0].notes[0].lyric = '春';
  const block = m.musicBlock(score, 'round-trip');
  const parsed = m.findMusicBlocks('Text\n' + block + '\nText')[0];
  assert.equal(JSON.stringify(parsed.score), JSON.stringify(score));
  assert.equal(parsed.from, 5); assert.equal(parsed.to - parsed.from, block.length);
  assert.equal(m.findMusicBlocks(block.replace('\\startpiece', '\\smallmusicsize\\startpiece'))[0].score, null);
  assert.equal(m.findMusicBlocks(block.replaceAll('\n', '\r\n'))[0].score.title, score.title);
  assert.equal(m.findMusicBlocks(block.replace(/% texpro-music-data:.*/, '% texpro-music-data: damaged'))[0].score, null);
});

test('invalid persisted music cannot enter visual controls', () => {
  for (const patch of [{ tempo: NaN }, { display: 8 }, { meter: [0,4] }, { parts: [] }, { key: 8 }]) assert.equal(m.restoreScore({ ...m.newScore(), ...patch }), null);
  for (const patch of [{ pitch: Infinity }, { duration: 3 }, { chord: [99] }, { dotted: 'yes' }, { tie: 4 }, { lyric: 42 }, { string: 7 }]) {
    const s = m.newScore(); Object.assign(s.parts[0].notes[0], patch); assert.equal(m.restoreScore(s), null);
  }
  const a=m.newScore(), b=m.newScore(); a.parts[0].notes[0].pitch=20; assert.notEqual(a.parts[0].notes[0].pitch,b.parts[0].notes[0].pitch);
});

test('bar-crossing durations split with ties and short parts receive rests', () => {
  const notes=m.measuredNotes({ name:'Test',clef:'treble',notes:[{pitch:0,duration:4},{pitch:2,duration:1,dotted:true,lyric:'one'}] },32,64);
  let at=0;
  for(const n of notes){assert.ok(at%32+m.ticks(n)<=32);at+=m.ticks(n);}
  assert.equal(at,64);assert.ok(notes[1].tie);assert.equal(notes.filter(n=>n.lyric==='one').length,1);
  assert.equal(notes.at(-1).pitch,null);
  const tiny=m.measuredNotes({name:'Small',clef:'treble',notes:Array.from({length:25},()=>({pitch:0,duration:32,dotted:true}))},32,64);
  assert.equal(tiny.reduce((a,n)=>a+m.ticks(n),0),64);
});

test('full score and selected part share data; TeX escapes labels, chords and lyrics', () => {
  const s=m.newScore('ensemble');
  s.parts[0].notes[0] = {pitch:7,duration:4,chord:[9,11],harmony:'C# & G',lyric:'a_b',dynamic:'mf'};
  const full=m.generateMusic(s);
  assert.match(full,/\\instrumentnumber\{3\}/);assert.match(full,/\\zq\{/);assert.ok(full.includes('C\\# \\& G'));assert.ok(full.includes('a\\_b'));
  s.display=1;
  assert.match(m.generateMusic(s),/\\instrumentnumber\{1\}/);assert.ok(!m.generateMusic(s).includes('Flute'));assert.equal(s.parts.length,3);
  assert.ok(m.generateMusic({...m.newScore('guitar'),parts:[{name:'Guitar',clef:'treble',notes:[{pitch:null,duration:4}]}]}).includes('{r}'));
});

test('MusiXTeX spacing reruns when mx2 is absent, and reports missing TeX packages', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'texpro-spacing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const data='header\nspacing data\n';fs.writeFileSync(path.join(root,'main.mx1'),data);
  let calls=0;
  const options={buildDir:root,jobName:'main',before:data,resolveScript:async()=>'/tex/musixflx.lua',run:async()=>{calls++;return {code:0};}};
  await musicSpacing(options);assert.equal(calls,1);
  fs.writeFileSync(path.join(root,'main.mx2'),'spacing');
  assert.equal(await musicSpacing(options),null);
  const failed=await musicSpacing({...options,before:null,resolveScript:async()=>''});assert.equal(failed.code,1);assert.match(failed.stderr,/musixtex/);
});

test('block delimiters match full IDs and ties require the same pitch and accidental', () => {
  const source=m.musicBlock(m.newScore(),'same');
  assert.equal(m.findMusicBlocks(source.replace('music end same','music end same-longer')).length,0);
  const notes=m.newScore().parts[0].notes;
  assert.equal(m.canTie({...notes[0],pitch:0,accidental:1},{...notes[1],pitch:0,accidental:0}),false);
  assert.equal(m.canTie({pitch:0,duration:4,chord:[2,4]},{pitch:0,duration:2,chord:[4,2]}),true);
});
