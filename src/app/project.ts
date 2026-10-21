import type { Project, ReviewComment } from '../types';
import { basename, stem } from '../lib/latex';

export function findFirstTex(nodes: Project['tree']): string | null {
  for (const node of nodes) {
    if (node.type === 'file' && /\.(tex|ltx)$/i.test(node.name)) return node.path;
  }
  for (const node of nodes) {
    if (node.type === 'dir' && node.children) {
      const found = findFirstTex(node.children);
      if (found) return found;
    }
  }
  return null;
}

export function flattenFiles(nodes: Project['tree']): Project['tree'] {
  const result: Project['tree'] = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    else if (node.children) result.push(...flattenFiles(node.children));
  }
  return result;
}

export function isTextPath(path: string): boolean {
  if (!/\.[^/]+$/.test(path)) return true;
  return /\.(tex|ltx|bib|sty|cls|txt|md|json|ya?ml|csv|lua|def|clo|cfg)$/i.test(path);
}

export function normalizeFile(path: string): string {
  return path.replace(/\/\.\//g, '/');
}

export function fileFromBuild(root: string, rootFile: string, buildDir = '.texpro/build'): string {
  return `${root}/${buildDir.replace(/^\/+/, '')}/${stem(rootFile)}.pdf`;
}

export async function reanchorComments(root: string, tree: Project['tree'], comments: ReviewComment[]): Promise<ReviewComment[]> {
  const files = flattenFiles(tree);
  const paths = new Set(files.map((file) => file.path));
  const cache = new Map<string, string>();
  const read = async (file: string) => {
    if (!cache.has(file)) {
      try { cache.set(file, await window.texpro.readFile(file)); } catch { cache.set(file, ''); }
    }
    return cache.get(file) || '';
  };
  const result: ReviewComment[] = [];
  for (const comment of comments) {
    let file = comment.file;
    if (!paths.has(file)) {
      const replacement = files.find((item) => item.name === basename(comment.file));
      if (replacement) file = replacement.path;
    }
    if (!paths.has(file)) { result.push(comment); continue; }
    const text = await read(file);
    const needle = comment.snippet.trim();
    let index = needle ? text.indexOf(needle) : -1;
    if (index < 0 && needle.length > 20) index = text.indexOf(needle.slice(0, 20));
    if (index >= 0) {
      const line = text.slice(0, index).split('\n').length;
      result.push({ ...comment, file, line });
    } else {
      result.push({ ...comment, file });
    }
  }
  return result;
}
