export interface CwlCompletion {
  label: string;
  detail: string;
  template: string;
  boost?: number;
}

/**
 * Parse the useful subset of TeXstudio .cwl files:
 * - # comments
 * - \command{...} / \command[opt]{...}
 * - \begin{environment}
 * Other cwl metadata/keyval lines are ignored.
 */
export function parseCwl(source: string): CwlCompletion[] {
  const results: CwlCompletion[] = [];
  const seen = new Set<string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('%')) continue;
    const environment = /^\\begin\{([^}]+)\}/.exec(line);
    if (environment) {
      const name = environment[1];
      if (seen.has(`env:${name}`)) continue;
      seen.add(`env:${name}`);
      results.push({
        label: `\\begin{${name}}`,
        detail: 'cwl environment',
        template: `\\begin{${name}}|\n\n\\end{${name}}`,
        boost: 2,
      });
      continue;
    }
    const match = /^\\([A-Za-z@]+)(\[[^\]]*\])?(\{[^}]*\})?/.exec(line);
    if (!match) continue;
    const command = `\\${match[1]}`;
    if (seen.has(`cmd:${command}`)) continue;
    seen.add(`cmd:${command}`);
    let template = line.replace(/\s+%+\s*$/, '');
    if (template.includes('|')) {
      // already has a cursor marker
    } else if (template.includes('{')) {
      const brace = template.indexOf('{');
      template = template.slice(0, brace + 1) + '|' + template.slice(brace + 1);
    } else {
      template += '|';
    }
    results.push({ label: command, detail: 'cwl command', template, boost: 2 });
  }
  return results;
}

export function parseMacros(source: string): CwlCompletion[] {
  try {
    const value = JSON.parse(source);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item.body === 'string')
      .map((item) => ({
        label: String(item.label || item.trigger || 'macro'),
        detail: String(item.detail || 'project macro'),
        template: String(item.body),
        boost: Number(item.boost) || 3,
      }));
  } catch {
    return [];
  }
}
