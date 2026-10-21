import katex from 'katex';

export interface SymbolItem {
  id: string;
  name: string;
  latex: string;
  preview?: string;
  aliases?: string[];
}

export interface SymbolModule {
  id: string;
  name: string;
  description: string;
  symbols: SymbolItem[];
}

const s = (id: string, name: string, latex: string, preview?: string, aliases?: string[]): SymbolItem => ({
  id,
  name,
  latex,
  preview,
  aliases,
});

export const symbolModules: SymbolModule[] = [
  {
    id: 'greek',
    name: 'Greek',
    description: 'Lowercase and uppercase Greek letters',
    symbols: [
      s('alpha', 'alpha', '\\alpha'), s('beta', 'beta', '\\beta'), s('gamma', 'gamma', '\\gamma'),
      s('delta', 'delta', '\\delta'), s('epsilon', 'epsilon', '\\epsilon'), s('varepsilon', 'varepsilon', '\\varepsilon'),
      s('zeta', 'zeta', '\\zeta'), s('eta', 'eta', '\\eta'), s('theta', 'theta', '\\theta'),
      s('vartheta', 'vartheta', '\\vartheta'), s('iota', 'iota', '\\iota'), s('kappa', 'kappa', '\\kappa'),
      s('lambda', 'lambda', '\\lambda'), s('mu', 'mu', '\\mu'), s('nu', 'nu', '\\nu'),
      s('xi', 'xi', '\\xi'), s('pi', 'pi', '\\pi'), s('varpi', 'varpi', '\\varpi'),
      s('rho', 'rho', '\\rho'), s('varrho', 'varrho', '\\varrho'), s('sigma', 'sigma', '\\sigma'),
      s('varsigma', 'varsigma', '\\varsigma'), s('tau', 'tau', '\\tau'), s('upsilon', 'upsilon', '\\upsilon'),
      s('phi', 'phi', '\\phi'), s('varphi', 'varphi', '\\varphi'), s('chi', 'chi', '\\chi'),
      s('psi', 'psi', '\\psi'), s('omega', 'omega', '\\omega'), s('Gamma', 'Gamma', '\\Gamma'),
      s('Delta', 'Delta', '\\Delta'), s('Theta', 'Theta', '\\Theta'), s('Lambda', 'Lambda', '\\Lambda'),
      s('Xi', 'Xi', '\\Xi'), s('Pi', 'Pi', '\\Pi'), s('Sigma', 'Sigma', '\\Sigma'),
      s('Upsilon', 'Upsilon', '\\Upsilon'), s('Phi', 'Phi', '\\Phi'), s('Psi', 'Psi', '\\Psi'),
      s('Omega', 'Omega', '\\Omega'),
    ],
  },
  {
    id: 'operators',
    name: 'Operators',
    description: 'Sums, integrals, fractions, roots and large operators',
    symbols: [
      s('sum', 'sum', '\\sum_{i=1}^{n}', '\\sum_{i=1}^{n}', ['sigma', 'total']),
      s('prod', 'product', '\\prod_{i=1}^{n}', '\\prod_{i=1}^{n}', ['product']),
      s('int', 'integral', '\\int_{a}^{b}', '\\int_{a}^{b}', ['integral']),
      s('iint', 'double integral', '\\iint', '\\iint'),
      s('iiint', 'triple integral', '\\iiint', '\\iiint'),
      s('oint', 'contour integral', '\\oint', '\\oint'),
      s('partial', 'partial derivative', '\\partial', '\\partial', ['derivative']),
      s('nabla', 'nabla', '\\nabla', '\\nabla', ['gradient']),
      s('infty', 'infinity', '\\infty', '\\infty'),
      s('pm', 'plus-minus', '\\pm', '\\pm'),
      s('mp', 'minus-plus', '\\mp', '\\mp'),
      s('times', 'times', '\\times', '\\times'),
      s('div', 'division', '\\div', '\\div'),
      s('cdot', 'dot product', '\\cdot', '\\cdot'),
      s('ast', 'asterisk', '\\ast', '\\ast'),
      s('star', 'star', '\\star', '\\star'),
      s('circ', 'composition', '\\circ', '\\circ'),
      s('oplus', 'direct sum', '\\oplus', '\\oplus'),
      s('otimes', 'tensor product', '\\otimes', '\\otimes'),
      s('frac', 'fraction', '\\frac{}{}', '\\frac{a}{b}', ['fraction']),
      s('dfrac', 'display fraction', '\\dfrac{}{}', '\\dfrac{a}{b}'),
      s('sqrt', 'square root', '\\sqrt{}', '\\sqrt{x}', ['root']),
      s('nthroot', 'nth root', '\\sqrt[n]{}', '\\sqrt[n]{x}'),
      s('binom', 'binomial', '\\binom{}{}', '\\binom{n}{k}'),
    ],
  },
  {
    id: 'relations',
    name: 'Relations',
    description: 'Comparisons, set relations and approximations',
    symbols: [
      s('leq', 'less or equal', '\\leq', '\\leq', ['le']),
      s('geq', 'greater or equal', '\\geq', '\\geq', ['ge']),
      s('neq', 'not equal', '\\neq', '\\neq', ['ne']),
      s('approx', 'approximately', '\\approx', '\\approx'),
      s('equiv', 'equivalent', '\\equiv', '\\equiv'),
      s('sim', 'similar', '\\sim', '\\sim'),
      s('simeq', 'similar or equal', '\\simeq', '\\simeq'),
      s('propto', 'proportional', '\\propto', '\\propto'),
      s('in', 'element of', '\\in', '\\in'),
      s('notin', 'not element of', '\\notin', '\\notin'),
      s('ni', 'contains', '\\ni', '\\ni'),
      s('subset', 'subset', '\\subset', '\\subset'),
      s('subseteq', 'subset or equal', '\\subseteq', '\\subseteq'),
      s('supset', 'superset', '\\supset', '\\supset'),
      s('supseteq', 'superset or equal', '\\supseteq', '\\supseteq'),
      s('cup', 'union', '\\cup', '\\cup'),
      s('cap', 'intersection', '\\cap', '\\cap'),
      s('setminus', 'set difference', '\\setminus', '\\setminus'),
      s('emptyset', 'empty set', '\\emptyset', '\\emptyset'),
      s('varnothing', 'empty set', '\\varnothing', '\\varnothing'),
    ],
  },
  {
    id: 'logic',
    name: 'Sets & Logic',
    description: 'Logic quantifiers, numbers and special sets',
    symbols: [
      s('forall', 'for all', '\\forall', '\\forall'),
      s('exists', 'exists', '\\exists', '\\exists'),
      s('nexists', 'not exists', '\\nexists', '\\nexists'),
      s('neg', 'negation', '\\neg', '\\neg', ['not']),
      s('land', 'and', '\\land', '\\land'),
      s('lor', 'or', '\\lor', '\\lor'),
      s('implies', 'implies', '\\implies', '\\implies'),
      s('iff', 'if and only if', '\\iff', '\\iff'),
      s('therefore', 'therefore', '\\therefore', '\\therefore'),
      s('because', 'because', '\\because', '\\because'),
      s('mathbbR', 'real numbers', '\\mathbb{R}', '\\mathbb{R}', ['R']),
      s('mathbbN', 'natural numbers', '\\mathbb{N}', '\\mathbb{N}', ['N']),
      s('mathbbZ', 'integers', '\\mathbb{Z}', '\\mathbb{Z}', ['Z']),
      s('mathbbQ', 'rational numbers', '\\mathbb{Q}', '\\mathbb{Q}', ['Q']),
      s('mathbbC', 'complex numbers', '\\mathbb{C}', '\\mathbb{C}', ['C']),
      s('mathcalP', 'power set', '\\mathcal{P}', '\\mathcal{P}'),
    ],
  },
  {
    id: 'arrows',
    name: 'Arrows',
    description: 'Mappings, implications and directional arrows',
    symbols: [
      s('to', 'to', '\\to', '\\to', ['rightarrow']),
      s('rightarrow', 'right arrow', '\\rightarrow', '\\rightarrow'),
      s('leftarrow', 'left arrow', '\\leftarrow', '\\leftarrow'),
      s('leftrightarrow', 'left-right arrow', '\\leftrightarrow', '\\leftrightarrow'),
      s('Rightarrow', 'double right arrow', '\\Rightarrow', '\\Rightarrow'),
      s('Leftarrow', 'double left arrow', '\\Leftarrow', '\\Leftarrow'),
      s('Leftrightarrow', 'double left-right arrow', '\\Leftrightarrow', '\\Leftrightarrow'),
      s('mapsto', 'maps to', '\\mapsto', '\\mapsto'),
      s('longmapsto', 'long maps to', '\\longmapsto', '\\longmapsto'),
      s('uparrow', 'up arrow', '\\uparrow', '\\uparrow'),
      s('downarrow', 'down arrow', '\\downarrow', '\\downarrow'),
      s('nearrow', 'north-east arrow', '\\nearrow', '\\nearrow'),
      s('searrow', 'south-east arrow', '\\searrow', '\\searrow'),
    ],
  },
  {
    id: 'delimiters',
    name: 'Delimiters',
    description: 'Parentheses, brackets, angles and norms',
    symbols: [
      s('paren', 'parentheses', '\\left( \\right)', '\\left( x \\right)'),
      s('bracket', 'brackets', '\\left[ \\right]', '\\left[ x \\right]'),
      s('brace', 'braces', '\\left\\{ \\right\\}', '\\left\\{ x \\right\\}'),
      s('angle', 'angle brackets', '\\langle \\rangle', '\\langle x, y \\rangle'),
      s('ceil', 'ceiling', '\\lceil \\rceil', '\\lceil x \\rceil'),
      s('floor', 'floor', '\\lfloor \\rfloor', '\\lfloor x \\rfloor'),
      s('abs', 'absolute value', '\\left| \\right|', '\\left| x \\right|'),
      s('norm', 'norm', '\\left\\| \\right\\|', '\\left\\| x \\right\\|'),
      s('set', 'set braces', '\\{ \\}', '\\{ x \\}'),
      s('lparen', 'left parenthesis', '(', '('),
      s('rparen', 'right parenthesis', ')', ')'),
    ],
  },
  {
    id: 'accents',
    name: 'Accents',
    description: 'Vectors, hats, bars and decorated symbols',
    symbols: [
      s('hat', 'hat', '\\hat{}', '\\hat{x}'),
      s('widehat', 'wide hat', '\\widehat{}', '\\widehat{xyz}'),
      s('bar', 'bar', '\\bar{}', '\\bar{x}'),
      s('overline', 'overline', '\\overline{}', '\\overline{xyz}'),
      s('underline', 'underline', '\\underline{}', '\\underline{xyz}'),
      s('vec', 'vector', '\\vec{}', '\\vec{v}'),
      s('dot', 'dot', '\\dot{}', '\\dot{x}'),
      s('ddot', 'double dot', '\\ddot{}', '\\ddot{x}'),
      s('tilde', 'tilde', '\\tilde{}', '\\tilde{x}'),
      s('widetilde', 'wide tilde', '\\widetilde{}', '\\widetilde{xyz}'),
      s('overbrace', 'overbrace', '\\overbrace{}', '\\overbrace{x+y}'),
      s('underbrace', 'underbrace', '\\underbrace{}', '\\underbrace{x+y}'),
    ],
  },
  {
    id: 'structures',
    name: 'Structures',
    description: 'Matrices, cases, aligned equations and text',
    symbols: [
      s('pmatrix', 'parenthesized matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'),
      s('bmatrix', 'bracketed matrix', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'),
      s('vmatrix', 'determinant', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'),
      s('cases', 'piecewise cases', '\\begin{cases} a & x > 0 \\\\ b & x \\leq 0 \\end{cases}', '\\begin{cases} a & x > 0 \\\\ b & x \\leq 0 \\end{cases}'),
      s('aligned', 'aligned equations', '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}'),
      s('text', 'text inside math', '\\text{}', '\\text{text}'),
      s('overline2', 'overbrace with label', '\\overbrace{x+y}^{n}', '\\overbrace{x+y}^{n}'),
      s('underbrace2', 'underbrace with label', '\\underbrace{x+y}_{n}', '\\underbrace{x+y}_{n}'),
    ],
  },
];

export function symbolModule(id: string): SymbolModule | undefined {
  return symbolModules.find((module) => module.id === id);
}

export function renderSymbolHtml(symbol: SymbolItem): string {
  try {
    return katex.renderToString(symbol.preview || symbol.latex, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return '';
  }
}

export function allSymbols(): SymbolItem[] {
  return symbolModules.flatMap((module) => module.symbols);
}
