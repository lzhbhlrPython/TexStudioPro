export interface PackageSpec {
  name: string;
  options: string;
}

export interface DocumentSetup {
  className: string;
  classOptions: string;
  packages: PackageSpec[];
}

export interface PackageCatalogItem {
  name: string;
  description: string;
  category: string;
  options?: string;
}

export interface ClassCatalogItem {
  name: string;
  description: string;
  category: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
}

export const classCatalog: ClassCatalogItem[] = [
  { name: 'article', description: 'Short papers, notes and journal-style articles', category: 'Standard' },
  { name: 'report', description: 'Multi-chapter reports with chapters and appendices', category: 'Standard' },
  { name: 'book', description: 'Books and theses with front matter and chapters', category: 'Standard' },
  { name: 'beamer', description: 'Presentation slides', category: 'Presentation' },
  { name: 'memoir', description: 'Highly configurable book/report class', category: 'Extended' },
  { name: 'scrartcl', description: 'KOMA-Script article', category: 'KOMA-Script' },
  { name: 'scrreprt', description: 'KOMA-Script report', category: 'KOMA-Script' },
  { name: 'ctexart', description: 'Chinese article with ctex typography', category: 'Chinese', engine: 'xelatex' },
  { name: 'ctexrep', description: 'Chinese report with ctex typography', category: 'Chinese', engine: 'xelatex' },
  { name: 'ctexbook', description: 'Chinese book with ctex typography', category: 'Chinese', engine: 'xelatex' },
  { name: 'standalone', description: 'Single TikZ/equation images with tight cropping', category: 'Graphics' },
  { name: 'IEEEtran', description: 'IEEE conference and journal papers', category: 'Academic' },
  { name: 'elsarticle', description: 'Elsevier journal submissions', category: 'Academic' },
  { name: 'revtex4-2', description: 'APS/AIP physics journals', category: 'Academic' },
  { name: 'acmart', description: 'ACM conference and journal papers', category: 'Academic' },
  { name: 'ltjsarticle', description: 'Japanese article with LuaTeX-ja', category: 'Japanese', engine: 'lualatex' },
];

export const packageCatalog: PackageCatalogItem[] = [
  { name: 'amsmath', description: 'Core display math environments and alignment', category: 'Math' },
  { name: 'amssymb', description: 'AMS symbol fonts', category: 'Math' },
  { name: 'mathtools', description: 'Extensions and fixes for amsmath', category: 'Math' },
  { name: 'bm', description: 'Bold math symbols', category: 'Math' },
  { name: 'siunitx', description: 'Numbers, units and quantities', category: 'Math' },
  { name: 'physics', description: 'Derivatives, bra-ket and vector notation', category: 'Math' },
  { name: 'mhchem', description: 'Chemical formulae and equations', category: 'Science', options: 'version=4' },
  { name: 'chemfig', description: 'Chemical structure diagrams', category: 'Science' },
  { name: 'geometry', description: 'Page size and margins', category: 'Layout', options: 'margin=2.5cm' },
  { name: 'setspace', description: 'Line spacing', category: 'Layout' },
  { name: 'microtype', description: 'Micro-typographic adjustments', category: 'Layout' },
  { name: 'fancyhdr', description: 'Headers and footers', category: 'Layout' },
  { name: 'titlesec', description: 'Section heading formatting', category: 'Layout' },
  { name: 'titling', description: 'Title block formatting', category: 'Layout' },
  { name: 'parskip', description: 'Paragraph spacing instead of indentation', category: 'Layout' },
  { name: 'multicol', description: 'Multiple columns', category: 'Layout' },
  { name: 'graphicx', description: 'Include images', category: 'Graphics' },
  { name: 'xcolor', description: 'Colour support', category: 'Graphics' },
  { name: 'tikz', description: 'Programmable vector graphics', category: 'Graphics' },
  { name: 'pgfplots', description: 'Plots and axes', category: 'Graphics', options: 'compat=1.18' },
  { name: 'circuitikz', description: 'Circuit diagrams', category: 'Graphics' },
  { name: 'booktabs', description: 'Professional table rules', category: 'Tables' },
  { name: 'tabularx', description: 'Tables with automatic column widths', category: 'Tables' },
  { name: 'longtable', description: 'Tables spanning pages', category: 'Tables' },
  { name: 'multirow', description: 'Cells spanning multiple rows', category: 'Tables' },
  { name: 'makecell', description: 'Line breaks and formatting inside table cells', category: 'Tables' },
  { name: 'threeparttable', description: 'Table notes with controlled width', category: 'Tables' },
  { name: 'hyperref', description: 'Clickable links, PDF metadata and bookmarks', category: 'References' },
  { name: 'cleveref', description: 'Automatic cross-reference names', category: 'References' },
  { name: 'natbib', description: 'Author-year citations', category: 'References' },
  { name: 'biblatex', description: 'Flexible bibliography processing', category: 'References', options: 'backend=biber' },
  { name: 'csquotes', description: 'Context-sensitive quotation marks', category: 'References' },
  { name: 'url', description: 'Breakable URLs', category: 'References' },
  { name: 'enumitem', description: 'Control list spacing and labels', category: 'Lists' },
  { name: 'listings', description: 'Source code listings', category: 'Code' },
  { name: 'minted', description: 'Syntax-highlighted code via Pygments', category: 'Code' },
  { name: 'algorithm2e', description: 'Algorithm pseudocode', category: 'Code' },
  { name: 'algorithmicx', description: 'Algorithmic pseudocode', category: 'Code' },
  { name: 'ctex', description: 'Chinese typesetting for non-ctex classes', category: 'Language', options: 'UTF8' },
  { name: 'fontspec', description: 'OpenType/TrueType fonts with XeLaTeX or LuaLaTeX', category: 'Language' },
  { name: 'polyglossia', description: 'Multilingual typesetting with XeLaTeX', category: 'Language' },
  { name: 'babel', description: 'Language-specific typography', category: 'Language' },
  { name: 'luatexja', description: 'Japanese typesetting with LuaLaTeX', category: 'Language' },
  { name: 'indentfirst', description: 'Indent the first paragraph after a heading', category: 'Language' },
  { name: 'xeCJK', description: 'CJK fonts and line breaking for XeLaTeX', category: 'Language' },
  { name: 'caption', description: 'Caption formatting', category: 'Floats' },
  { name: 'subcaption', description: 'Subfigures and subtables', category: 'Floats' },
  { name: 'float', description: 'The [H] float placement modifier', category: 'Floats' },
  { name: 'wrapfig', description: 'Text wrapping around figures', category: 'Floats' },
  { name: 'tcolorbox', description: 'Styled boxes and callouts', category: 'Design' },
  { name: 'mdframed', description: 'Framed and shaded environments', category: 'Design' },
  { name: 'fontawesome5', description: 'Font Awesome icons', category: 'Design' },
  { name: 'acronym', description: 'Acronym lists', category: 'Utilities' },
  { name: 'glossaries', description: 'Glossaries and symbols', category: 'Utilities' },
  { name: 'appendix', description: 'Appendix numbering and formatting', category: 'Utilities' },
  { name: 'todo', description: 'TODO notes in the margin', category: 'Utilities' },
  { name: 'lineno', description: 'Line numbers for review', category: 'Utilities' },
];

function splitPackageNames(value: string): string[] {
  return value.split(',').map((name) => name.trim()).filter(Boolean);
}

export function parseDocumentSetup(text: string): DocumentSetup {
  const classMatch = /\\documentclass(?:\[([^\]]*)\])?\{([^}]+)\}/.exec(text);
  const className = classMatch?.[2]?.trim() || 'article';
  const classOptions = classMatch?.[1]?.trim() || '';
  const begin = text.indexOf('\\begin{document}');
  const preamble = begin >= 0 ? text.slice(0, begin) : text;
  const packages: PackageSpec[] = [];
  const seen = new Set<string>();
  for (const line of preamble.split('\n')) {
    if (/^\s*%/.test(line)) continue;
    const match = /\\usepackage(?:\[([^\]]*)\])?\{([^}]+)\}/.exec(line);
    if (!match) continue;
    for (const name of splitPackageNames(match[2])) {
      if (seen.has(name)) continue;
      seen.add(name);
      packages.push({ name, options: match[1]?.trim() || '' });
    }
  }
  return { className, classOptions, packages };
}

export function buildDocumentSetup(text: string, setup: DocumentSetup): string {
  const classMatch = /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.exec(text);
  if (!classMatch) return text;
  const options = setup.classOptions.trim();
  const classLine = `\\documentclass${options ? `[${options}]` : ''}{${setup.className}}`;
  let output = text.replace(classMatch[0], classLine);

  const begin = output.indexOf('\\begin{document}');
  if (begin < 0) return output;
  const preamble = output.slice(0, begin);
  const rest = output.slice(begin);
  const lines = preamble.split('\n');
  const packageLines: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*%/.test(lines[index])) continue;
    if (/\\usepackage(?:\[[^\]]*\])?\{[^}]+\}/.test(lines[index])) packageLines.push(index);
  }

  const rendered = setup.packages
    .filter((item) => item.name.trim())
    .map((item) => `\\usepackage${item.options.trim() ? `[${item.options.trim()}]` : ''}{${item.name.trim()}}`);

  if (packageLines.length) {
    const first = packageLines[0];
    const filtered = lines.filter((_line, index) => !packageLines.includes(index));
    const insertAt = first - packageLines.filter((index) => index < first).length;
    filtered.splice(insertAt, 0, ...rendered);
    output = filtered.join('\n') + rest;
  } else {
    const classLineIndex = lines.findIndex((line) => /\\documentclass/.test(line));
    lines.splice(classLineIndex >= 0 ? classLineIndex + 1 : 0, 0, ...rendered);
    output = lines.join('\n') + rest;
  }
  return output;
}

export function addPackage(setup: DocumentSetup, item: PackageCatalogItem): DocumentSetup {
  if (setup.packages.some((pkg) => pkg.name === item.name)) return setup;
  return { ...setup, packages: [...setup.packages, { name: item.name, options: item.options || '' }] };
}

export function removePackage(setup: DocumentSetup, name: string): DocumentSetup {
  return { ...setup, packages: setup.packages.filter((pkg) => pkg.name !== name) };
}

export function movePackage(setup: DocumentSetup, name: string, direction: -1 | 1): DocumentSetup {
  const index = setup.packages.findIndex((pkg) => pkg.name === name);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= setup.packages.length) return setup;
  const packages = [...setup.packages];
  [packages[index], packages[target]] = [packages[target], packages[index]];
  return { ...setup, packages };
}
