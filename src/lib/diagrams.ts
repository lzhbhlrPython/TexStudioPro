export type DiagramKind = 'circuit' | 'logic' | 'structure';

export interface DiagramOptions {
  title: string;
  components: string;
  expression: string;
  molecule: string;
}

export function circuitTikz(components: string): string {
  const parts = components.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) parts.push('V', 'R');
  const styleFor = (part: string, index: number) => {
    const kind = part[0]?.toUpperCase();
    const style = kind === 'V' || kind === 'B' ? 'battery1' : kind === 'C' ? 'capacitor' : kind === 'L' ? 'inductor' : 'R';
    return `${style}, l=$${part || `R${index + 1}`}$`;
  };
  let path = '(0,0)';
  parts.forEach((part, index) => {
    const top = `(${index * 2},3)`;
    const next = `(${(index + 1) * 2},3)`;
    if (index === 0) path += ` to[${styleFor(part, index)}] ${top}`;
    else path += ` -- ${top} to[${styleFor(part, index)}] ${next}`;
  });
  const right = parts.length * 2;
  path += ` -- (${right},0) -- (0,0);`;
  return String.raw`\begin{circuitikz}[american]
  \draw ${path}
\end{circuitikz}`;
}

export function logicTikz(expression: string): string {
  const expr = expression.trim() || 'A & B';
  const ops = [
    { token: '&', port: 'and port' },
    { token: '|', port: 'or port' },
    { token: '^', port: 'xor port' },
  ];
  const found = ops.find((op) => expr.includes(op.token));
  const operands = found ? expr.split(found.token).map((part) => part.replace(/[()!]/g, '').trim()).filter(Boolean) : ['A', 'B'];
  const port = found?.port || 'and port';
  const lines = [String.raw`\begin{circuitikz}`, String.raw`  \node[${port}] (g1) at (3,2) {};`];
  operands.slice(0, 2).forEach((operand, index) => {
    lines.push(String.raw`  \draw (0,${2.5 - index}) node[left] {$${operand}$} -- (g1.in ${index + 1});`);
  });
  lines.push(String.raw`  \draw (g1.out) -- ++(1,0) node[right] {$Y$};`, String.raw`\end{circuitikz}`);
  return lines.join('\n');
}

export function structureTikz(molecule: string): string {
  const value = molecule.trim() || 'CH3-CH2-OH';
  return `\\chemfig{${value}}`;
}

export function generateDiagram(kind: DiagramKind, options: DiagramOptions): string {
  if (kind === 'circuit') return circuitTikz(options.components);
  if (kind === 'logic') return logicTikz(options.expression);
  return structureTikz(options.molecule);
}
