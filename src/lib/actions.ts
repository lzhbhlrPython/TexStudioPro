export interface ProjectAction {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export const defaultActions: ProjectAction[] = [
  { id: 'latexmk', name: 'latexmk · PDF', command: 'latexmk', args: ['-pdf', '-interaction=nonstopmode', '-synctex=1', '{rootFile}'] },
  { id: 'pdflatex', name: 'pdfLaTeX', command: 'pdflatex', args: ['-interaction=nonstopmode', '-synctex=1', '{rootFile}'] },
  { id: 'xelatex', name: 'XeLaTeX', command: 'xelatex', args: ['-interaction=nonstopmode', '-synctex=1', '{rootFile}'] },
  { id: 'lualatex', name: 'LuaLaTeX', command: 'lualatex', args: ['-interaction=nonstopmode', '-synctex=1', '{rootFile}'] },
  { id: 'bibtex', name: 'BibTeX', command: 'bibtex', args: ['{rootName}'] },
  { id: 'biber', name: 'Biber', command: 'biber', args: ['{rootName}'] },
  { id: 'makeindex', name: 'MakeIndex', command: 'makeindex', args: ['{rootName}.idx'] },
];

/** Resolve TeXstudio-style txs:/// action references to plain executables. */
export function resolveTxsCommand(command: string): string {
  const match = /^txs:\/\/\/([A-Za-z0-9_-]+)$/.exec(command.trim());
  if (!match) return command;
  const map: Record<string, string> = {
    latex: 'latex', pdflatex: 'pdflatex', xelatex: 'xelatex', lualatex: 'lualatex',
    latexmk: 'latexmk', bibtex: 'bibtex', biber: 'biber', makeindex: 'makeindex',
  };
  return map[match[1]] || match[1];
}

export function expandActionArgs(action: ProjectAction, values: { rootFile: string; rootName: string }): string[] {
  return (action.args || []).map((arg) => arg
    .replaceAll('{rootFile}', values.rootFile)
    .replaceAll('{rootName}', values.rootName)
    .replaceAll('{projectRoot}', '.'));
}

export function parseActions(text: string): ProjectAction[] | null {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return null;
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.command === 'string').map((item) => ({
      id: item.id,
      name: String(item.name || item.id),
      command: String(item.command),
      args: Array.isArray(item.args) ? item.args.map(String) : [],
      cwd: item.cwd ? String(item.cwd) : undefined,
      env: item.env && typeof item.env === 'object' ? item.env : undefined,
    }));
  } catch {
    return null;
  }
}
