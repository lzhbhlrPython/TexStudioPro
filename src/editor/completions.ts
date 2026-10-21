import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { ProjectSymbols } from '../types';
import { basename, dirname, joinPath } from '../lib/latex';
import type { CwlCompletion } from '../lib/cwl';

interface CompletionData {
  symbols: ProjectSymbols;
  filePath: string;
  root: string;
}

const environments = [
  'document', 'abstract', 'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
  'multline', 'multline*', 'split', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix',
  'itemize', 'enumerate', 'description', 'figure', 'figure*', 'table', 'table*', 'tabular',
  'tabularx', 'longtable', 'center', 'flushleft', 'flushright', 'quote', 'quotation', 'verse',
  'theorem', 'lemma', 'proof', 'definition', 'corollary', 'verbatim', 'lstlisting', 'minted',
  'tikzpicture', 'minipage', 'multicols', 'frame', 'block', 'columns',
];

const documentClasses = ['article', 'report', 'book', 'letter', 'beamer', 'memoir', 'scrartcl', 'scrreprt', 'scrbook'];

const packages = [
  'amsmath', 'amssymb', 'amsthm', 'mathtools', 'geometry', 'graphicx', 'booktabs', 'tabularx',
  'longtable', 'array', 'multirow', 'multicol', 'xcolor', 'hyperref', 'cleveref', 'natbib',
  'biblatex', 'fontenc', 'inputenc', 'lmodern', 'microtype', 'enumitem', 'float', 'caption',
  'subcaption', 'titlesec', 'setspace', 'fancyhdr', 'listings', 'minted', 'tikz', 'pgfplots',
  'siunitx', 'physics', 'bm', 'csquotes', 'polyglossia', 'fontspec', 'ctex', 'beamer', 'algorithm2e',
];

let externalCommands: CwlCompletion[] = [];

export function setCustomCompletions(items: CwlCompletion[]) {
  externalCommands = items;
}

const commands: Array<{ label: string; detail: string; template?: string; boost?: number }> = [
  { label: '\\documentclass', detail: 'class', template: '\\documentclass{article}|' },
  { label: '\\usepackage', detail: 'package', template: '\\usepackage{amsmath}|' },
  { label: '\\begin', detail: 'environment', template: '\\begin{equation}|\n\n\\end{equation}' },
  { label: '\\end', detail: 'close environment', template: '\\end{}|' },
  { label: '\\section', detail: 'heading 1', template: '\\section{|}' },
  { label: '\\section*', detail: 'unnumbered heading', template: '\\section*{|}' },
  { label: '\\subsection', detail: 'heading 2', template: '\\subsection{|}' },
  { label: '\\subsubsection', detail: 'heading 3', template: '\\subsubsection{|}' },
  { label: '\\paragraph', detail: 'heading 4', template: '\\paragraph{|}' },
  { label: '\\chapter', detail: 'chapter', template: '\\chapter{|}' },
  { label: '\\part', detail: 'part', template: '\\part{|}' },
  { label: '\\title', detail: 'document title', template: '\\title{|}' },
  { label: '\\author', detail: 'author', template: '\\author{|}' },
  { label: '\\date', detail: 'date', template: '\\date{\\today}|' },
  { label: '\\maketitle', detail: 'render title' },
  { label: '\\tableofcontents', detail: 'table of contents' },
  { label: '\\label', detail: 'label', template: '\\label{|}' },
  { label: '\\ref', detail: 'reference', template: '\\ref{|}' },
  { label: '\\eqref', detail: 'equation reference', template: '\\eqref{|}' },
  { label: '\\pageref', detail: 'page reference', template: '\\pageref{|}' },
  { label: '\\autoref', detail: 'smart reference', template: '\\autoref{|}' },
  { label: '\\cite', detail: 'citation', template: '\\cite{|}' },
  { label: '\\citep', detail: 'parenthetical citation', template: '\\citep{|}' },
  { label: '\\citet', detail: 'textual citation', template: '\\citet{|}' },
  { label: '\\footnote', detail: 'footnote', template: '\\footnote{|}' },
  { label: '\\emph', detail: 'emphasis', template: '\\emph{|}' },
  { label: '\\textbf', detail: 'bold', template: '\\textbf{|}' },
  { label: '\\textit', detail: 'italic', template: '\\textit{|}' },
  { label: '\\texttt', detail: 'monospace', template: '\\texttt{|}' },
  { label: '\\underline', detail: 'underline', template: '\\underline{|}' },
  { label: '\\textsc', detail: 'small caps', template: '\\textsc{|}' },
  { label: '\\href', detail: 'hyperlink', template: '\\href{https://}{|}' },
  { label: '\\url', detail: 'URL', template: '\\url{|}' },
  { label: '\\includegraphics', detail: 'image', template: '\\includegraphics[width=0.8\\linewidth]{|}' },
  { label: '\\caption', detail: 'caption', template: '\\caption{|}' },
  { label: '\\centering', detail: 'center content' },
  { label: '\\item', detail: 'list item', template: '\\item |' },
  { label: '\\newpage', detail: 'page break' },
  { label: '\\clearpage', detail: 'flush floats and break page' },
  { label: '\\hspace', detail: 'horizontal space', template: '\\hspace{|}' },
  { label: '\\vspace', detail: 'vertical space', template: '\\vspace{|}' },
  { label: '\\noindent', detail: 'no first-line indent' },
  { label: '\\input', detail: 'include file', template: '\\input{|}' },
  { label: '\\include', detail: 'include file (page break)', template: '\\include{|}' },
  { label: '\\bibliography', detail: 'bibliography', template: '\\bibliography{|}' },
  { label: '\\bibliographystyle', detail: 'bibliography style', template: '\\bibliographystyle{|}' },
  { label: '\\frac', detail: 'fraction', template: '\\frac{|}{}' },
  { label: '\\sqrt', detail: 'square root', template: '\\sqrt{|}' },
  { label: '\\sum', detail: 'sum', template: '\\sum_{|}^{}' },
  { label: '\\int', detail: 'integral', template: '\\int_{|}^{} ' },
  { label: '\\prod', detail: 'product', template: '\\prod_{|}^{} ' },
  { label: '\\lim', detail: 'limit', template: '\\lim_{| \\to } ' },
  { label: '\\left', detail: 'auto-sized delimiter', template: '\\left(|\\right)' },
  { label: '\\right', detail: 'close auto-sized delimiter', template: '\\right|' },
  { label: '\\mathbb', detail: 'blackboard bold', template: '\\mathbb{|}' },
  { label: '\\mathcal', detail: 'calligraphic', template: '\\mathcal{|}' },
  { label: '\\mathrm', detail: 'upright math', template: '\\mathrm{|}' },
  { label: '\\mathbf', detail: 'bold math', template: '\\mathbf{|}' },
  { label: '\\operatorname', detail: 'math operator', template: '\\operatorname{|}' },
  { label: '\\text', detail: 'text inside math', template: '\\text{|}' },
  { label: '\\quad', detail: 'wide space' },
  { label: '\\qquad', detail: 'extra-wide space' },
  { label: '\\hline', detail: 'table rule' },
  { label: '\\toprule', detail: 'booktabs top rule' },
  { label: '\\midrule', detail: 'booktabs middle rule' },
  { label: '\\bottomrule', detail: 'booktabs bottom rule' },
  { label: '\\multicolumn', detail: 'span columns', template: '\\multicolumn{2}{|c}{}' },
  { label: '\\multirow', detail: 'span rows', template: '\\multirow{2}{*}{}|' },
  { label: '\\todo', detail: 'todo note', template: '\\todo{|}' },
  { label: '\\newcommand', detail: 'define command', template: '\\newcommand{\\|}{}' },
  { label: '\\renewcommand', detail: 'redefine command', template: '\\renewcommand{\\|}{}' },
  { label: '\\DeclareMathOperator', detail: 'math operator', template: '\\DeclareMathOperator{\\|}{}' },
  { label: '\\newenvironment', detail: 'define environment', template: '\\newenvironment{|}{}{}' },
];

const greek = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho',
  'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
];

for (const name of greek) {
  commands.push({ label: '\\' + name, detail: 'Greek letter', boost: 4 });
}

const mathSymbols: Array<[string, string]> = [
  ['infty', 'infinity'], ['partial', 'partial derivative'], ['nabla', 'nabla'], ['pm', 'plus-minus'],
  ['times', 'times'], ['cdot', 'dot product'], ['leq', 'less or equal'], ['geq', 'greater or equal'],
  ['neq', 'not equal'], ['approx', 'approximately'], ['equiv', 'equivalent'], ['in', 'element of'],
  ['notin', 'not element of'], ['subset', 'subset'], ['subseteq', 'subset or equal'], ['cup', 'union'],
  ['cap', 'intersection'], ['forall', 'for all'], ['exists', 'exists'], ['rightarrow', 'right arrow'],
  ['leftarrow', 'left arrow'], ['Rightarrow', 'double right arrow'], ['leftrightarrow', 'left-right arrow'],
  ['to', 'arrow'], ['mapsto', 'maps to'], ['langle', 'left angle'], ['rangle', 'right angle'],
  ['otimes', 'tensor product'], ['oplus', 'direct sum'], ['ast', 'asterisk'], ['star', 'star'],
  ['cdots', 'centered dots'], ['ldots', 'dots'], ['vdots', 'vertical dots'], ['ddots', 'diagonal dots'],
];

for (const [name, detail] of mathSymbols) {
  commands.push({ label: '\\' + name, detail, boost: 2 });
}

function insertTemplate(view: EditorView, from: number, to: number, template: string) {
  const marker = template.indexOf('|');
  const text = marker >= 0 ? template.slice(0, marker) + template.slice(marker + 1) : template;
  const anchor = from + (marker >= 0 ? marker : text.length);
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
}

function commandCompletion(item: { label: string; detail: string; template?: string; boost?: number }): Completion {
  return {
    label: item.label,
    detail: item.detail,
    boost: item.boost,
    type: item.template ? 'snippet' : 'keyword',
    apply: (view, _completion, from, to) => {
      insertTemplate(view, from, to, item.template || item.label);
    },
  };
}

function closesWithBrace(label: string): Completion {
  return {
    label,
    type: 'variable',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: label + '}' },
        selection: { anchor: from + label.length + 1 },
      });
      view.focus();
    },
  };
}

function environmentCompletion(name: string): Completion {
  return {
    label: name,
    type: 'class',
    detail: 'environment',
    apply: (view, _completion, from, to) => {
      const close = `\\end{${name}}`;
      const insert = `${name}}\n  |\n${close}`;
      const marker = insert.indexOf('|');
      const text = insert.replace('|', '');
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + marker },
        scrollIntoView: true,
      });
      view.focus();
    },
  };
}

function imageCompletion(image: ProjectSymbols['images'][number]): Completion {
  const rel = image.relative.replace(/\\/g, '/');
  return {
    label: basename(rel),
    detail: dirname(rel),
    type: 'text',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: rel + '}' },
        selection: { anchor: from + rel.length + 1 },
      });
      view.focus();
    },
  };
}

export function makeLatexCompletionSource(getData: () => CompletionData) {
  return (context: CompletionContext): CompletionResult | null => {
    const data = getData();
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.sliceDoc(Math.max(line.from, context.pos - 240), context.pos);

    const environment = before.match(/\\begin\{([^}]*)$/);
    if (environment) {
      return {
        from: context.pos - environment[1].length,
        options: environments.map(environmentCompletion),
        validFor: /^[^}]*$/,
      };
    }

    const ref = before.match(/\\(?:ref|eqref|pageref|autoref|cref|Cref)\{([^}]*)$/);
    if (ref) {
      return {
        from: context.pos - ref[1].length,
        options: data.symbols.labels.map(closesWithBrace),
        validFor: /^[^}]*$/,
      };
    }

    const cite = before.match(/\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite)\*?(?:\[[^\]]*\])*\{([^}]*)$/);
    if (cite) {
      return {
        from: context.pos - cite[1].length,
        options: data.symbols.citations.map(closesWithBrace),
        validFor: /^[^}]*$/,
      };
    }

    const packageName = before.match(/\\usepackage(?:\[[^\]]*\])?\{([^,}]*)$/);
    if (packageName) {
      return {
        from: context.pos - packageName[1].length,
        options: [...new Set([...packages, ...data.symbols.packages])].map((name) => ({
          label: name,
          type: 'namespace',
        })),
        validFor: /^[^,}]*$/,
      };
    }

    const className = before.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)$/);
    if (className) {
      return {
        from: context.pos - className[1].length,
        options: documentClasses.map((name) => ({ label: name, type: 'class' })),
        validFor: /^[^}]*$/,
      };
    }

    const graphic = before.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/);
    if (graphic) {
      return {
        from: context.pos - graphic[1].length,
        options: data.symbols.images.map(imageCompletion),
        validFor: /^[^}]*$/,
      };
    }

    const command = context.matchBefore(/\\[a-zA-Z@]*/);
    if (command && (context.explicit || command.text.length >= 2)) {
      return {
        from: command.from,
        options: [...commands, ...externalCommands].map(commandCompletion),
        validFor: /^\\[a-zA-Z@]*$/,
      };
    }

    if (context.explicit && /^[a-zA-Z]*$/.test(before)) {
      return {
        from: context.pos - (before.match(/[a-zA-Z]*$/) || [''])[0].length,
        options: [...commands, ...externalCommands].map(commandCompletion),
      };
    }

    return null;
  };
}

export const snippetLibrary = [
  {
    id: 'figure',
    title: 'Figure',
    description: 'Centered image with caption and label',
    icon: 'image',
    template: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{|}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}',
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Booktabs table with three columns',
    icon: 'table',
    template: '\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\toprule\n    |Header & Header & Header \\\\\n    \\midrule\n    Cell & Cell & Cell \\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}',
  },
  {
    id: 'equation',
    title: 'Equation',
    description: 'Numbered display equation',
    icon: 'sigma',
    template: '\\begin{equation}\n  \\label{eq:|}\n  \n\\end{equation}',
  },
  {
    id: 'align',
    title: 'Aligned equations',
    description: 'Multi-line aligned derivation',
    icon: 'align',
    template: '\\begin{align}\n  | &= \\\\\n    &= \n\\end{align}',
  },
  {
    id: 'list',
    title: 'Itemized list',
    description: 'Bulleted list with two items',
    icon: 'list',
    template: '\\begin{itemize}\n  \\item |\n  \\item \n\\end{itemize}',
  },
  {
    id: 'code',
    title: 'Code block',
    description: 'Verbatim code block with optional language label',
    icon: 'code',
    template: '\\begin{verbatim}\n|\n\\end{verbatim}',
  },
  {
    id: 'theorem',
    title: 'Theorem',
    description: 'Theorem environment with proof',
    icon: 'book',
    template: '\\begin{theorem}|\\end{theorem}\n\n\\begin{proof}\n  \n\\end{proof}',
  },
];

export function projectImagePath(imagePath: string, filePath: string): string {
  return joinPath(dirname(filePath), imagePath);
}
