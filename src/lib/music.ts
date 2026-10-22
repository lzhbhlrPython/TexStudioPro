/** Portable music blocks: editable state is a TeX comment; the score itself is ordinary TeX. */
export type MusicKind = 'staff' | 'numbered' | 'guitar';
export type Clef = 'treble' | 'bass' | 'alto';
export interface MusicNote {
    pitch: number | null;
    duration: number;
    dotted?: boolean;
    accidental?: -1 | 0 | 1;
    tie?: boolean;
    lyric?: string;
    fret?: number;
    string?: number;
    chord?: number[];
    harmony?: string;
    dynamic?: string;
}
export interface MusicPart {
    name: string;
    clef: Clef;
    notes: MusicNote[];
}
export interface MusicScore {
    version: 1;
    title: string;
    kind: MusicKind;
    meter: [
        number,
        number
    ];
    key: number;
    parts: MusicPart[];
    display: number;
    tempo: number;
}
export const MUSIC_START = /^% TeXPro music begin ([a-zA-Z0-9-]+)\r?$/gm;
const durations = [1, 2, 4, 8, 16, 32];
export function texText(value: string) { return value.replace(/[\\{}%&#_$^~]/g, c => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '&': '\\&', '#': '\\#', '_': '\\_', '$': '\\$', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' }[c]!)); }
export function restoreScore(value: unknown): MusicScore | null {
    if (!value || typeof value !== 'object')
        return null;
    const s = value as MusicScore;
    if (s.version !== 1 || !['staff', 'numbered', 'guitar'].includes(s.kind) || typeof s.title !== 'string' || s.title.length > 200 || !Array.isArray(s.meter) || s.meter.length !== 2 || !Number.isInteger(s.meter[0]) || s.meter[0] < 1 || s.meter[0] > 16 || ![2, 4, 8, 16].includes(s.meter[1]) || !Number.isInteger(s.key) || Math.abs(s.key) > 7 || !Number.isFinite(s.tempo) || s.tempo < 20 || s.tempo > 300 || !Array.isArray(s.parts) || !s.parts.length || s.parts.length > 8 || !Number.isInteger(s.display) || s.display < -1 || s.display >= s.parts.length)
        return null;
    for (const p of s.parts) {
        if (!p || typeof p.name !== 'string' || p.name.length > 80 || !['treble', 'bass', 'alto'].includes(p.clef) || !Array.isArray(p.notes) || p.notes.length > 256)
            return null;
        for (const n of p.notes)
            if (!n || (n.pitch !== null && (!Number.isInteger(n.pitch) || n.pitch < -14 || n.pitch > 28)) || !durations.includes(n.duration) || (n.chord !== undefined && (!Array.isArray(n.chord) || n.chord.length > 7 || n.chord.some(p => !Number.isInteger(p) || p < -14 || p > 28))) || (n.harmony !== undefined && (typeof n.harmony !== 'string' || n.harmony.length > 24)) || (n.dynamic !== undefined && !['', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'sfz'].includes(n.dynamic)) || (n.dotted !== undefined && typeof n.dotted !== 'boolean') || (n.tie !== undefined && typeof n.tie !== 'boolean') || (n.accidental !== undefined && ![-1, 0, 1].includes(n.accidental)) || (n.lyric !== undefined && (typeof n.lyric !== 'string' || n.lyric.length > 80)) || (n.fret !== undefined && (!Number.isInteger(n.fret) || n.fret < 0 || n.fret > 24)) || (n.string !== undefined && (!Number.isInteger(n.string) || n.string < 1 || n.string > 6)))
                return null;
    }
    return structuredClone(s);
}
const note = (pitch: number | null, duration = 4): MusicNote => ({ pitch, duration });
export const musicTemplates: Array<{
    id: string;
    name: string;
    score: MusicScore;
}> = [
    { id: 'melody', name: 'Melody & lyrics', score: { version: 1, title: 'Melody', kind: 'staff', meter: [4, 4], key: 0, tempo: 96, display: -1, parts: [{ name: 'Voice', clef: 'treble', notes: [0, 1, 2, 4, 3, 2, 1, 0].map(p => note(p)) }] } },
    { id: 'piano', name: 'Piano', score: { version: 1, title: 'Piano study', kind: 'staff', meter: [4, 4], key: 0, tempo: 88, display: -1, parts: [{ name: 'Piano RH', clef: 'treble', notes: [0, 2, 4, 7, 5, 4, 2, 0].map(p => note(p)) }, { name: 'Piano LH', clef: 'bass', notes: [-7, -3, -4, -7].map(p => note(p, 2)) }] } },
    { id: 'choir', name: 'SATB choir', score: { version: 1, title: 'Choral study', kind: 'staff', meter: [4, 4], key: 0, tempo: 80, display: -1, parts: [{ name: 'Soprano', clef: 'treble', notes: [4, 5, 4, 2].map(p => note(p, 2)) }, { name: 'Alto', clef: 'treble', notes: [2, 3, 2, 0].map(p => note(p, 2)) }, { name: 'Tenor', clef: 'treble', notes: [0, 1, 0, -1].map(p => note(p, 2)) }, { name: 'Bass', clef: 'bass', notes: [-7, -4, -7, -7].map(p => note(p, 2)) }] } },
    { id: 'ensemble', name: 'Conductor score', score: { version: 1, title: 'Chamber ensemble', kind: 'staff', meter: [4, 4], key: 0, tempo: 108, display: -1, parts: [{ name: 'Flute', clef: 'treble', notes: [7, 8, 9, 11, 10, 9, 8, 7].map(p => note(p)) }, { name: 'Violin', clef: 'treble', notes: [4, 5, 4, 2].map(p => note(p, 2)) }, { name: 'Cello', clef: 'bass', notes: [-7, -7].map(p => note(p, 1)) }] } },
    { id: 'numbered', name: 'Numbered notation', score: { version: 1, title: 'Numbered melody', kind: 'numbered', meter: [4, 4], key: 0, tempo: 96, display: -1, parts: [{ name: 'Melody', clef: 'treble', notes: [0, 1, 2, 4, 3, 2, 1, 0].map(p => note(p)) }] } },
    { id: 'guitar', name: 'Guitar tablature', score: { version: 1, title: 'Guitar study', kind: 'guitar', meter: [4, 4], key: 0, tempo: 90, display: -1, parts: [{ name: 'Guitar', clef: 'treble', notes: [0, 2, 3, 2, 0, 2, 3, 0].map((f, i) => ({ ...note(i), fret: f, string: i < 4 ? 1 : 2 })) }] } },
];
export function newScore(template = 'melody'): MusicScore { return structuredClone((musicTemplates.find(t => t.id === template) || musicTemplates[0]).score); }
export function ticks(n: MusicNote) { return 32 / n.duration * (n.dotted ? 1.5 : 1); }
export function musicIssues(score: MusicScore): string[] {
    const expected = score.meter[0] * 32 / score.meter[1];
    return score.parts.flatMap(p => {
        const total = p.notes.reduce((s, n) => s + ticks(n), 0);
        return total && total % expected ? [`${p.name}: ${(total % expected) / 8} / ${expected / 8}`] : [];
    });
}
function pitchPosition(n: MusicNote, clef: Clef) { return (n.pitch || 0) - (clef === 'bass' ? -12 : clef === 'alto' ? -6 : 2); }
export function canTie(a: MusicNote, b: MusicNote) {
    return a.pitch !== null && a.pitch === b.pitch && a.accidental === b.accidental && JSON.stringify([...(a.chord || [])].sort()) === JSON.stringify([...(b.chord || [])].sort());
}
function nativeNote(n: MusicNote, clef: Clef, tieId: number, closeTie: boolean): string {
    if (n.pitch === null) {
        const rest = n.duration === 1 ? 'pause' : n.duration === 2 ? 'hp' : n.duration === 4 ? 'qp' : n.duration === 8 ? 'ds' : n.duration === 16 ? 'qs' : n.duration === 32 ? 'hs' : 'qqs';
        return `\\${rest}${n.dotted ? 'p' : ''}`;
    }
    const pos = pitchPosition(n, clef), p = `{${pos}}`;
    const accidental = n.accidental === 1 ? `\\sh${p}` : n.accidental === -1 ? `\\fl${p}` : n.accidental === 0 ? `\\na${p}` : '';
    const command = n.duration === 1 ? 'wh' : n.duration === 2 ? 'ha' : n.duration === 4 ? 'qa' : n.duration === 8 ? 'ca' : n.duration === 16 ? 'cca' : n.duration === 32 ? 'ccca' : 'cccca';
    const chord = [...new Set(n.chord || [])].filter(p => p !== n.pitch).sort((a,b)=>a-b);
    const pitches = [n.pitch, ...chord];
    const ties = pitches.map((pitch,index)=>`${closeTie?`\\ttie{${tieId+index}}`:''}${n.tie?`\\itieu{${tieId+index}}{${pitchPosition({...n,pitch},clef)}}`:''}`).join('');
    const heads = chord.map(pitch => `\\${n.duration === 1 ? 'zw' : n.duration === 2 ? 'zh' : 'zq'}{${pitchPosition({ ...n, pitch }, clef)}}`).join('');
    return `${ties}${n.lyric ? `\\zchar{-6}{\\scriptsize ${texText(n.lyric)}}` : ''}${n.harmony ? `\\zchar{12}{\\small ${texText(n.harmony)}}` : ''}${n.dynamic ? `\\zchar{-9}{\\textit{${n.dynamic}}}` : ''}${accidental}${n.dotted ? `\\pt${p}` : ''}${heads}\\${command}${p}`;
}
/** Split notes at bar lines and pad short parts. The saved musical events stay unchanged. */
export function measuredNotes(part: MusicPart, measure: number, end: number): MusicNote[] {
    const output: MusicNote[] = [];
    let at = 0;
    for (const source of [...part.notes, { pitch: null, duration: 1 } as MusicNote]) {
        let remaining = ticks(source);
        if (output.length && at >= end)
            break;
        if (part.notes.indexOf(source) < 0)
            remaining = Math.max(0, end - at);
        let first = true;
        while (remaining > 0) {
            const available = Math.min(remaining, measure - at % measure);
            const candidates = [1, 2, 4, 8, 16, 32, 64].flatMap(duration => [{ duration, dotted: true }, { duration, dotted: false }]).sort((a, b) => ticks(b as MusicNote) - ticks(a as MusicNote));
            const value = candidates.find(v => ticks(v as MusicNote) <= available)!;
            const length = ticks(value as MusicNote);
            output.push({ ...source, ...value, lyric: first ? source.lyric : undefined, harmony: first ? source.harmony : undefined, dynamic: first ? source.dynamic : undefined, tie: source.pitch !== null && (remaining > length || Boolean(source.tie)) });
            at += length;
            remaining -= length;
            first = false;
        }
    }
    return output;
}
function staffTex(score: MusicScore, parts: MusicPart[]): string {
    // MusiXTeX counts instruments upwards from the bottom; presentation lists them top-down.
    const measure = score.meter[0] * 32 / score.meter[1];
    const end = Math.max(measure, ...parts.map(p => Math.ceil(p.notes.reduce((a, n) => a + ticks(n), 0) / measure) * measure));
    const ordered = [...parts].reverse().map(p => ({ ...p, notes: measuredNotes(p, measure, end) }));
    const setup = ordered.map((p, i) => `\\setclef{${i + 1}}{${p.clef === 'bass' ? 6 : p.clef === 'alto' ? 3 : 0}}\\setname{${i + 1}}{${texText(p.name)}}`).join('\n');
    const timeline = ordered.map(p => { let time = 0; return p.notes.map(n => { const at = time; time += ticks(n); return { at, n }; }); });
    const times = [...new Set(timeline.flat().map(e => e.at))].sort((a, b) => a - b);
    const body = times.map(at => `${at > 0 && at % measure === 0 ? '\\bar\n' : ''}\\Notes ${ordered.map((p, i) => { const j = timeline[i].findIndex(e => e.at === at); return j < 0 ? '\\sk' : nativeNote({ ...p.notes[j], tie: p.notes[j].tie && j + 1 < p.notes.length && canTie(p.notes[j],p.notes[j+1]) }, p.clef, i*8, j > 0 && Boolean(p.notes[j - 1].tie) && canTie(p.notes[j-1],p.notes[j])); }).join(' & ')}\\en`).join('\n');
    return `\\begin{music}\n\\instrumentnumber{${ordered.length}}\n\\setmaxslurs{64}\n${setup}\n\\generalsignature{${score.key}}\n\\generalmeter{\\meterfrac{${score.meter[0]}}{${score.meter[1]}}}\n\\parindent=${Math.min(110, Math.max(36, ...ordered.map(p => p.name.length * 4 + 12)))}pt\n\\startpiece\n${body || '\\Notes \\qp\\en'}\n\\Endpiece\n\\end{music}`;
}
function graphicTex(score: MusicScore, parts: MusicPart[]): string {
    const lines: string[] = [];
    const tonic = ((score.key * 4) % 7 + 7) % 7;
    if (score.kind === 'numbered')
        lines.push(`\\noindent 1 = ${['C', 'D', 'E', 'F', 'G', 'A', 'B'][tonic]}${score.key >= 6 ? '\\ensuremath{\\sharp}' : score.key <= -2 ? '\\ensuremath{\\flat}' : ''}\\par`);
    const measure = score.meter[0] * 32 / score.meter[1];
    for (const p of parts) {
        lines.push(`\\par\\smallskip\\noindent\\textbf{${texText(p.name)}}\\par`);
        const total = p.notes.reduce((a, n) => a + ticks(n), 0), end = Math.max(measure, Math.ceil(total / measure) * measure);
        const notes = measuredNotes(p, measure, end);
        let at = 0, cursor = 1, used = 0, rowStart = 0;
        const open = () => { lines.push('\\noindent\\begin{tikzpicture}[x=0.65cm,y=0.24cm,baseline]'); cursor = 1; used = 0; rowStart = lines.length; };
        const close = () => {
            if (score.kind === 'guitar')
                for (let s = 0; s < 6; s++)
                    lines.splice(rowStart, 0, `\\draw[gray] (0,${s}) -- (${cursor},${s});`);
            lines.push('\\end{tikzpicture}\\par\\smallskip');
        };
        open();
        notes.forEach((n, j) => {
            const x = cursor, y = score.kind === 'guitar' ? 6 - (n.string || 1) : 1;
            const relative = (n.pitch || 0) - tonic, octave = Math.floor(relative / 7), degree = n.pitch === null ? 0 : ((relative % 7) + 7) % 7 + 1;
            const accidental = n.accidental === 1 ? '\\ensuremath{\\sharp}' : n.accidental === -1 ? '\\ensuremath{\\flat}' : n.accidental === 0 ? '\\ensuremath{\\natural}' : '';
            const symbol = score.kind === 'guitar' ? (n.pitch === null ? 'r' : String(n.fret || 0)) : `${accidental}${degree}`;
            lines.push(`\\node[fill=white,inner sep=1pt] at (${x},${y}) {${symbol}};`);
            if (score.kind === 'numbered') {
                if (n.pitch !== null)
                    for (let k = 0; k < Math.abs(octave); k++)
                        lines.push(`\\fill (${x},${octave > 0 ? 2.3 + k * 0.6 : -0.1 - k * 0.6}) circle (0.035cm);`);
                const beams = Math.max(0, Math.log2(n.duration) - 2);
                for (let b = 0; b < beams; b++)
                    lines.push(`\\draw (${x - 0.3},${-0.7 - b * 0.45}) -- (${x + 0.3},${-0.7 - b * 0.45});`);
                for (let dash = 1; dash < 4 / n.duration; dash++)
                    lines.push(`\\node at (${x + dash},1) {--};`);
            }
            else
                lines.push(`\\node[font=\\tiny] at (${x},-1) {1/${n.duration}};`);
            if (n.dotted)
                lines.push(`\\fill (${x + 0.35},${y}) circle (0.035cm);`);
            if (n.lyric)
                lines.push(`\\node[font=\\scriptsize] at (${x},-3) {${texText(n.lyric)}};`);
            if (n.harmony)
                lines.push(`\\node[font=\\small] at (${x},9) {${texText(n.harmony)}};`);
            if (n.dynamic)
                lines.push(`\\node[font=\\small\\itshape] at (${x},-5) {${n.dynamic}};`);
            cursor += Math.max(.8, ticks(n) / 8);
            at += ticks(n);
            used += ticks(n);
            if (n.tie && j < notes.length - 1 && canTie(n,notes[j+1]))
                lines.push(`\\draw (${x + .1},${y + 1.3}) to[bend left=30] (${cursor - .1},${y + 1.3});`);
            if (at % measure === 0) {
                lines.push(`\\draw (${cursor - .3},${score.kind === 'guitar' ? 0 : -1.8}) -- (${cursor - .3},${score.kind === 'guitar' ? 5 : 3});`);
                cursor += .6;
            }
            if ((cursor >= 12 || (used >= measure * Math.max(1, Math.floor(8 / (measure / 8))) && at % measure === 0)) && j < notes.length - 1) {
                close();
                open();
            }
        });
        close();
    }
    return lines.join('\n');
}
export function generateMusic(score: MusicScore): string {
    if (!restoreScore(score))
        throw new Error('Invalid music score');
    const parts = score.display < 0 ? score.parts : [score.parts[score.display]];
    return `\\begingroup\n\\noindent\\textbf{${texText(score.title)}}\\hfill {\\small ${score.meter.join('/')} \\quad ${score.tempo} BPM}\\par\n${score.kind === 'staff' ? staffTex(score, parts) : graphicTex(score, parts)}\n\\endgroup`;
}
export function encodeScore(score: MusicScore) { return btoa(unescape(encodeURIComponent(JSON.stringify(score)))); }
export function decodeScore(encoded: string): MusicScore | null { try {
    return restoreScore(JSON.parse(decodeURIComponent(escape(atob(encoded)))));
}
catch {
    return null;
} }
export function musicBlock(score: MusicScore, id: string = crypto.randomUUID()): string { return `% TeXPro music begin ${id}\n% texpro-music-data: ${encodeScore(score)}\n${generateMusic(score)}\n% TeXPro music end ${id}`; }
export interface ParsedMusicBlock {
    id: string;
    from: number;
    to: number;
    source: string;
    score: MusicScore | null;
    body: string;
}
export function findMusicBlocks(text: string): ParsedMusicBlock[] {
    const blocks: ParsedMusicBlock[] = [];
    let consumed = -1;
    for (const m of text.matchAll(new RegExp(MUSIC_START.source, 'gm'))) {
        if (m.index! < consumed) continue;
        const close = new RegExp('^% TeXPro music end ' + m[1] + '\\r?$', 'gm');
        close.lastIndex = m.index! + m[0].length;
        const end = close.exec(text);
        if (!end) continue;
        const to = end.index + end[0].replace(/\r$/, '').length;
        const source = text.slice(m.index!, to);
        const data = source.match(/^% texpro-music-data: ([A-Za-z0-9+/=]+)\r?$/m);
        const body = source.slice(source.indexOf('\n') + 1, source.lastIndexOf('\n')).replace(/^% texpro-music-data:.*\r?\n/m, '');
        const decoded = data ? decodeScore(data[1]) : null;
        const score = decoded && generateMusic(decoded).replaceAll('\r', '') === body.replaceAll('\r', '') ? decoded : null;
        blocks.push({ id: m[1], from: m.index!, to, source, score, body });
        consumed = to;
    }
    return blocks;
}
export function previewDocument(body: string): string { return `\\documentclass${/[\u3400-\u9fff]/.test(body) ? '[fontset=fandol]' : ''}{${/[\u3400-\u9fff]/.test(body) ? 'ctexart' : 'article'}}\n\\usepackage[margin=12mm]{geometry}\n\\usepackage{musixtex,tikz}\n\\pagestyle{empty}\n\\begin{document}\n${body}\n\\end{document}\n`; }
