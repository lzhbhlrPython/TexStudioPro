import type { WritingPosition } from '../editor/writingSession';

const KEY = 'texpro.writing-positions.v1';
interface Point extends WritingPosition { before: string; after: string; size: number }
interface ProjectResume { active: string; points: Record<string, Point> }
function read(): Record<string, ProjectResume> {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function inside(root: string, file: string) {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/+$/, ''), normalizedFile = file.replaceAll('\\', '/');
  const windows = /^[A-Za-z]:/.test(normalizedRoot);
  return (windows ? normalizedFile.toLowerCase().startsWith(normalizedRoot.toLowerCase() + '/') : normalizedFile.startsWith(normalizedRoot + '/')) && !normalizedFile.split('/').includes('..');
}
function write(value: Record<string, ProjectResume>) {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(value).slice(-20)))); } catch { /* A full/unavailable store must never stop writing. */ }
}
export function resumeFile(root: string): string | null {
  const active = read()[root]?.active;
  return typeof active === 'string' && inside(root, active) ? active : null;
}
export function rememberActiveFile(root: string, file: string) {
  if (!inside(root, file)) return;
  const all = read(), project = all[root] || { active: file, points: {} };
  delete all[root]; all[root] = { ...project, active: file }; write(all);
}
export function rememberWritingPosition(root: string, point: WritingPosition, source: string) {
  if (!inside(root, point.file)) return;
  const all = read(), project = all[root] || { active: point.file, points: {} };
  const safe = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
  const points = { ...project.points }; delete points[point.file];
  points[point.file] = { ...point, top: safe(point.top), left: safe(point.left), before: source.slice(Math.max(0, point.head - 40), point.head), after: source.slice(point.head, point.head + 40), size: source.length };
  delete all[root]; all[root] = { ...project, points: Object.fromEntries(Object.entries(points).slice(-50)) }; write(all);
}
export function resumePosition(root: string, file: string, source: string): WritingPosition | null {
  const point = read()[root]?.points?.[file];
  if (!point || typeof point.before !== 'string' || typeof point.after !== 'string' || !inside(root, file) || !['anchor', 'head', 'top', 'left', 'size'].every(key => Number.isFinite(point[key as keyof Point]))) return null;
  const clamp = (n: number) => Math.max(0, Math.min(source.length, Math.floor(n)));
  let head = clamp(point.head), anchor = clamp(point.anchor);
  const context = typeof point.before === 'string' && typeof point.after === 'string' ? point.before + point.after : '';
  const changed = source.length !== point.size || source.slice(Math.max(0, head - point.before.length), head + point.after.length) !== context;
  if (changed && context) {
    const at = source.indexOf(context);
    if (at >= 0 && source.indexOf(context, at + 1) < 0) { head = at + point.before.length; anchor = head; }
  }
  return { file, head, anchor, top: changed ? 0 : Math.max(0, point.top), left: Math.max(0, point.left) };
}
