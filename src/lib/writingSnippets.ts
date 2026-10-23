export interface WritingSnippet { id: string; label: string; text: string; cursor: number; packages: string[] }
const make = (id: string, label: string, text: string, start: string, packages: string[]): WritingSnippet => ({ id, label, text, cursor: Math.max(0, text.indexOf(start)), packages });
export const writingSnippets: WritingSnippet[] = [
  make('circuit', 'Insert circuit', '\\begin{circuitikz}[american]\n  \\draw (0,0) to[R,l={$R$}] (3,0);\n\\end{circuitikz}', 'R$}', ['circuitikz']),
  make('logic', 'Insert logic gates', '\\begin{circuitikz}\n  \\node[and port] (gate) at (0,0) {};\n  \\draw (gate.out) -- ++(1,0) node[right] {$Y$};\n\\end{circuitikz}', 'and port', ['circuitikz']),
  make('structure', 'Insert chemical structure', '\\chemfig{CH_3-CH_2-OH}', 'CH_3', ['chemfig']),
  make('skeletal', 'Insert skeletal formula', '\\chemfig{[:30]-[:-30]-[:30]-[:-30]}', '[:30]', ['chemfig']),
  make('tikz-writing', 'Insert TikZ diagram', '\\begin{tikzpicture}\n  \\draw[->] (0,0) -- (3,0) node[right] {$x$};\n\\end{tikzpicture}', '3,0', ['tikz']),
  make('chart-writing', 'Insert chart', '\\begin{tikzpicture}\n  \\begin{axis}[xlabel={$x$},ylabel={$y$}]\n    \\addplot {x^2};\n  \\end{axis}\n\\end{tikzpicture}', 'x^2', ['tikz', 'pgfplots']),
];

export function writingPackages(text: string): string[] {
  return [
    [/\\(?:begin\{circuitikz\}|ctikzset)/, 'circuitikz'],
    [/\\(?:chemfig|setchemfig)\b/, 'chemfig'],
    [/\\begin\{tikzpicture\}/, 'tikz'],
    [/\\(?:begin\{axis\}|addplot)/, 'pgfplots'],
    [/\\(?:toprule|midrule|bottomrule)\b/, 'booktabs'],
    [/\\includegraphics\b/, 'graphicx'],
    [/\\begin\{(?:equation|align|gather)\*?\}/, 'amsmath'],
    [/\\begin\{music\}/, 'musixtex'],
  ].flatMap(([pattern, name]) => (pattern as RegExp).test(text) ? [name as string] : []);
}
