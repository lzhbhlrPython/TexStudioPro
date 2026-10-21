export interface SpellingIssue {
  from: number;
  to: number;
  word: string;
  suggestion?: string;
}

export function findSpellingIssues(text: string, words: Set<string>): SpellingIssue[] {
  if (!words.size) return [];
  const masked = text
    .replace(/\\begin\{(?:verbatim|lstlisting|minted)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted)\}/g, (value) => ' '.repeat(value.length))
    .replace(/\\verb(.)[\s\S]*?\1/g, (value) => ' '.repeat(value.length))
    .replace(/\$\$[\s\S]*?\$\$/g, (value) => ' '.repeat(value.length))
    .replace(/\$[^$\n]*\$/g, (value) => ' '.repeat(value.length))
    .replace(/\\\([\s\S]*?\\\)/g, (value) => ' '.repeat(value.length))
    .replace(/\\\[[\s\S]*?\\\]/g, (value) => ' '.repeat(value.length))
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, (value) => ' '.repeat(value.length))
    .replace(/(?:https?|ftp):\/\/\S+/g, (value) => ' '.repeat(value.length))
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, (value) => ' '.repeat(value.length));

  const issues: SpellingIssue[] = [];
  const pattern = /[A-Za-z][A-Za-z'’-]{2,}/g;
  for (const match of masked.matchAll(pattern)) {
    const word = match[0];
    const normalized = word.toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, "'");
    if (normalized.length < 3 || /^\d/.test(normalized)) continue;
    if (word === word.toUpperCase() && word.length <= 5) continue;
    if (/^[A-Z][a-z]+$/.test(word) && words.has(normalized)) continue;
    if (words.has(normalized)) continue;
    const base = normalized.replace(/(ing|ed|es|s|ly)$/, '');
    if (base.length >= 3 && words.has(base)) continue;
    issues.push({ from: match.index || 0, to: (match.index || 0) + word.length, word });
    if (issues.length > 400) break;
  }
  return issues;
}
