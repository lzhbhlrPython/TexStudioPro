let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}-${Date.now().toString(36).slice(-3)}`;

export type AstNode =
  | { id: string; type: 'row'; children: AstNode[] }
  | { id: string; type: 'symbol'; latex: string }
  | { id: string; type: 'text'; value: string }
  | { id: string; type: 'raw'; latex: string }
  | { id: string; type: 'frac'; numerator: AstNode; denominator: AstNode }
  | { id: string; type: 'sqrt'; index: AstNode | null; body: AstNode }
  | { id: string; type: 'script'; base: AstNode; sup: AstNode | null; sub: AstNode | null }
  | { id: string; type: 'matrix'; env: 'pmatrix' | 'bmatrix' | 'vmatrix'; rows: AstNode[][] }
  | { id: string; type: 'cases'; rows: Array<{ expression: AstNode; condition: AstNode }> };

export function row(children: AstNode[] = []): AstNode {
  return { id: nextId('row'), type: 'row', children };
}

export function symbol(latex: string): AstNode {
  return { id: nextId('sym'), type: 'symbol', latex };
}

export function text(value: string): AstNode {
  return { id: nextId('text'), type: 'text', value };
}

export function raw(latex: string): AstNode {
  return { id: nextId('raw'), type: 'raw', latex };
}

export function frac(numerator: AstNode = row(), denominator: AstNode = row()): AstNode {
  return { id: nextId('frac'), type: 'frac', numerator, denominator };
}

export function sqrt(body: AstNode = row(), index: AstNode | null = null): AstNode {
  return { id: nextId('sqrt'), type: 'sqrt', index, body };
}

export function script(base: AstNode = row(), sup: AstNode | null = null, sub: AstNode | null = null): AstNode {
  return { id: nextId('script'), type: 'script', base, sup, sub };
}

export function matrix(env: 'pmatrix' | 'bmatrix' | 'vmatrix' = 'pmatrix', rows?: AstNode[][]): AstNode {
  return {
    id: nextId('matrix'),
    type: 'matrix',
    env,
    rows: rows || [
      [row([symbol('a')]), row([symbol('b')])],
      [row([symbol('c')]), row([symbol('d')])],
    ],
  };
}

export function cases(): AstNode {
  return {
    id: nextId('cases'),
    type: 'cases',
    rows: [
      { expression: row([symbol('a')]), condition: row([symbol('x>0')]) },
      { expression: row([symbol('b')]), condition: row([symbol('x\\leq 0')]) },
    ],
  };
}

function needsBrace(node: AstNode): boolean {
  if (node.type === 'row') return node.children.length !== 1;
  return false;
}

export function nodeToLatex(node: AstNode): string {
  switch (node.type) {
    case 'row':
      return node.children.map(nodeToLatex).join('');
    case 'symbol':
      return node.latex;
    case 'text':
      return `\\text{${escapeText(node.value)}}`;
    case 'raw':
      return node.latex;
    case 'frac':
      return `\\frac{${nodeToLatex(node.numerator)}}{${nodeToLatex(node.denominator)}}`;
    case 'sqrt':
      return `\\sqrt${node.index ? `[${nodeToLatex(node.index)}]` : ''}{${nodeToLatex(node.body)}}`;
    case 'script': {
      const base = needsBrace(node.base) ? `{${nodeToLatex(node.base)}}` : nodeToLatex(node.base);
      const sub = node.sub ? `_{${nodeToLatex(node.sub)}}` : '';
      const sup = node.sup ? `^{${nodeToLatex(node.sup)}}` : '';
      return `${base}${sub}${sup}`;
    }
    case 'matrix':
      return `\\begin{${node.env}}${node.rows.map((cells) => cells.map(nodeToLatex).join(' & ')).join(' \\\\ ')}\\end{${node.env}}`;
    case 'cases':
      return `\\begin{cases}${node.rows
        .map((entry) => `${nodeToLatex(entry.expression)} & ${nodeToLatex(entry.condition)}`)
        .join(' \\\\ ')}\\end{cases}`;
    default:
      return '';
  }
}

function escapeText(value: string): string {
  return value.replace(/([{}%$#&_])/g, '\\$1');
}

export function astToLatex(root: AstNode): string {
  return nodeToLatex(root).trim();
}

export function updateNode(root: AstNode, id: string, updater: (node: AstNode) => AstNode): AstNode {
  if (root.id === id) return updater(root);
  switch (root.type) {
    case 'row':
      return { ...root, children: root.children.map((child) => updateNode(child, id, updater)) };
    case 'frac':
      return {
        ...root,
        numerator: updateNode(root.numerator, id, updater),
        denominator: updateNode(root.denominator, id, updater),
      };
    case 'sqrt':
      return {
        ...root,
        body: updateNode(root.body, id, updater),
        index: root.index ? updateNode(root.index, id, updater) : null,
      };
    case 'script':
      return {
        ...root,
        base: updateNode(root.base, id, updater),
        sup: root.sup ? updateNode(root.sup, id, updater) : null,
        sub: root.sub ? updateNode(root.sub, id, updater) : null,
      };
    case 'matrix':
      return {
        ...root,
        rows: root.rows.map((cells) => cells.map((cell) => updateNode(cell, id, updater))),
      };
    case 'cases':
      return {
        ...root,
        rows: root.rows.map((entry) => ({
          expression: updateNode(entry.expression, id, updater),
          condition: updateNode(entry.condition, id, updater),
        })),
      };
    default:
      return root;
  }
}

export function appendToRow(root: AstNode, rowId: string, child: AstNode): AstNode {
  return updateNode(root, rowId, (node) =>
    node.type === 'row' ? { ...node, children: [...node.children, child] } : node,
  );
}

export function removeNode(root: AstNode, id: string): AstNode {
  const strip = (node: AstNode): AstNode | null => {
    if (node.id === id) return null;
    switch (node.type) {
      case 'row': {
        const children = node.children.map(strip).filter(Boolean) as AstNode[];
        return { ...node, children };
      }
      case 'frac':
        return {
          ...node,
          numerator: strip(node.numerator) || row(),
          denominator: strip(node.denominator) || row(),
        };
      case 'sqrt':
        return { ...node, body: strip(node.body) || row(), index: node.index ? strip(node.index) : null };
      case 'script':
        return {
          ...node,
          base: strip(node.base) || row(),
          sup: node.sup ? strip(node.sup) : null,
          sub: node.sub ? strip(node.sub) : null,
        };
      case 'matrix':
        return { ...node, rows: node.rows.map((cells) => cells.map((cell) => strip(cell) || row())) };
      case 'cases':
        return {
          ...node,
          rows: node.rows.map((entry) => ({
            expression: strip(entry.expression) || row(),
            condition: strip(entry.condition) || row(),
          })),
        };
      default:
        return node;
    }
  };
  return strip(root) || row();
}

export function makeNode(type: string): AstNode {
  switch (type) {
    case 'row':
      return row();
    case 'symbol':
      return symbol('\\alpha');
    case 'text':
      return text('text');
    case 'frac':
      return frac();
    case 'sqrt':
      return sqrt();
    case 'script':
      return script(row([symbol('x')]));
    case 'matrix':
      return matrix();
    case 'cases':
      return cases();
    case 'raw':
      return raw('\\mathrm{raw}');
    default:
      return symbol('x');
  }
}

// ── A deliberately small parser for the common inline structures ────────────

interface Token {
  type: 'command' | 'chars' | 'open' | 'close' | 'script' | 'align' | 'newline' | 'bracket' | 'env';
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === '\\') {
      if (input[index + 1] === '\\') {
        tokens.push({ type: 'newline', value: '\\\\' });
        index += 2;
        continue;
      }
      if (input.startsWith('\\begin{', index)) {
        const envMatch = input.slice(index).match(/^\\begin\{([^}]+)\}/);
        if (envMatch) {
          const env = envMatch[1];
          const endToken = `\\end{${env}}`;
          const endIndex = input.indexOf(endToken, index + envMatch[0].length);
          if (endIndex >= 0) {
            tokens.push({ type: 'env', value: input.slice(index, endIndex + endToken.length) });
            index = endIndex + endToken.length;
            continue;
          }
        }
      }
      const match = input.slice(index).match(/^\\([a-zA-Z@]+\*?|.)/);
      if (match) {
        tokens.push({ type: 'command', value: match[0] });
        index += match[0].length;
        continue;
      }
      index++;
      continue;
    }
    if (char === '{') {
      tokens.push({ type: 'open', value: char });
      index++;
      continue;
    }
    if (char === '}') {
      tokens.push({ type: 'close', value: char });
      index++;
      continue;
    }
    if (char === '^' || char === '_') {
      tokens.push({ type: 'script', value: char });
      index++;
      continue;
    }
    if (char === '&') {
      tokens.push({ type: 'align', value: char });
      index++;
      continue;
    }
    if (char === '[' || char === ']') {
      tokens.push({ type: 'bracket', value: char });
      index++;
      continue;
    }
    let end = index + 1;
    while (end < input.length && !/[\\{}^_&\[\]\s]/.test(input[end])) end++;
    tokens.push({ type: 'chars', value: input.slice(index, end) });
    index = end;
  }
  return tokens;
}

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private take(): Token | undefined {
    return this.tokens[this.position++];
  }

  parse(): AstNode {
    return this.parseSequence();
  }

  private parseSequence(stopAtClose = false): AstNode {
    const children: AstNode[] = [];
    while (this.position < this.tokens.length) {
      const token = this.peek();
      if (!token) break;
      if (stopAtClose && token.type === 'close') break;
      if (token.type === 'env') {
        children.push(raw(this.take()!.value));
        continue;
      }
      children.push(this.parseScripted());
    }
    return row(children);
  }

  private parseScripted(): AstNode {
    let base = this.parseAtom();
    while (this.peek()?.type === 'script') {
      const marker = this.take()!.value;
      const argument = this.parseAtom();
      if (base.type === 'script') {
        base = marker === '^' ? { ...base, sup: argument } : { ...base, sub: argument };
      } else {
        base = marker === '^' ? script(base, argument) : script(base, null, argument);
      }
    }
    return base;
  }

  private parseGroup(): AstNode {
    const token = this.take();
    if (!token || token.type !== 'open') return row();
    const node = this.parseSequence(true);
    if (this.peek()?.type === 'close') this.take();
    return node;
  }

  private parseAtom(): AstNode {
    const token = this.take();
    if (!token) return row();
    if (token.type === 'open') {
      this.position--;
      return this.parseGroup();
    }
    if (token.type === 'chars') return symbol(token.value);
    if (token.type === 'command') {
      const command = token.value;
      if (command === '\\frac' || command === '\\dfrac' || command === '\\tfrac') {
        const numerator = this.parseGroup();
        const denominator = this.parseGroup();
        return frac(numerator, denominator);
      }
      if (command === '\\sqrt') {
        let index: AstNode | null = null;
        if (this.peek()?.type === 'bracket') {
          this.take();
          const indexNodes: AstNode[] = [];
          while (this.peek() && this.peek()?.type !== 'bracket') indexNodes.push(this.parseScripted());
          if (this.peek()?.type === 'bracket') this.take();
          index = row(indexNodes);
        }
        return sqrt(this.parseGroup(), index);
      }
      if (command === '\\text' || command === '\\mathrm' || command === '\\mathbf' || command === '\\mathit' || command === '\\mathcal' || command === '\\mathbb' || command === '\\operatorname') {
        const group = this.parseGroup();
        if (command === '\\text') {
          return text(nodeToLatex(group));
        }
        return symbol(`${command}{${nodeToLatex(group)}}`);
      }
      if (command === '\\left' || command === '\\right') {
        const delimiter = this.take();
        return symbol(`${command}${delimiter?.value || ''}`);
      }
      return symbol(command);
    }
    return symbol(token.value);
  }
}

export function astFromLatex(latex: string): AstNode {
  try {
    const tokens = tokenize(latex);
    if (!tokens.length) return row();
    return new Parser(tokens).parse();
  } catch {
    return row([raw(latex)]);
  }
}

export function nodeLabel(node: AstNode): string {
  switch (node.type) {
    case 'row': return 'Row';
    case 'symbol': return node.latex;
    case 'text': return `"${node.value}"`;
    case 'raw': return 'Raw LaTeX';
    case 'frac': return 'Fraction';
    case 'sqrt': return 'Root';
    case 'script': return 'Script';
    case 'matrix': return node.env;
    case 'cases': return 'Cases';
    default: return 'Node';
  }
}
