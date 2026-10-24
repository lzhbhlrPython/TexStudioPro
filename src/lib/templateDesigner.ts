export interface TemplateDesign {
  name: string;
  description: string;
  base: 'article' | 'report' | 'ctexart' | 'beamer';
  engine: 'pdflatex' | 'xelatex' | 'lualatex';
  pageSize: 'a4paper' | 'letterpaper' | 'a5paper';
  margin: string;
  fontSize: 10 | 11 | 12;
  lineSpacing: '1.0' | '1.15' | '1.5' | '2.0';
  columns: 1 | 2;
  titleStyle: 'center' | 'left';
  accent: string;
  headingFont: 'serif' | 'sans';
  toc: boolean;
  abstract: boolean;
  pageNumbers: boolean;
  header: string;
  packages: {
    amsmath: boolean;
    graphicx: boolean;
    booktabs: boolean;
    tikz: boolean;
    pgfplots: boolean;
    hyperref: boolean;
  };
}

export const defaultTemplateDesign: TemplateDesign = {
  name: 'My article',
  description: 'A clean article designed in TeXPro.',
  base: 'article',
  engine: 'pdflatex',
  pageSize: 'a4paper',
  margin: '2.5cm',
  fontSize: 11,
  lineSpacing: '1.15',
  columns: 1,
  titleStyle: 'center',
  accent: '#b4552d',
  headingFont: 'sans',
  toc: true,
  abstract: true,
  pageNumbers: true,
  header: '',
  packages: {
    amsmath: true,
    graphicx: true,
    booktabs: true,
    tikz: false,
    pgfplots: false,
    hyperref: true,
  },
};

export function designTemplate(design: TemplateDesign): string {
  const chinese = design.base === 'ctexart';
  const beamer = design.base === 'beamer';
  const options = [
    chinese ? 'UTF8,fontset=fandol' : '',
    `${design.fontSize}pt`,
    design.pageSize,
    design.columns === 2 && !beamer ? 'twocolumn' : '',
  ].filter(Boolean).join(',');
  const lines: string[] = [];
  lines.push(`\\documentclass[${options}]{${design.base}}`);
  if (!chinese && !beamer) {
    lines.push('\\usepackage[T1]{fontenc}', '\\usepackage[utf8]{inputenc}');
  }
  if (!beamer) lines.push(`\\usepackage[margin=${design.margin}]{geometry}`);
  if (design.packages.amsmath) lines.push('\\usepackage{amsmath,amssymb}');
  if (design.packages.graphicx) lines.push('\\usepackage{graphicx}');
  if (design.packages.booktabs) lines.push('\\usepackage{booktabs}');
  if (design.packages.tikz) lines.push('\\usepackage{tikz}');
  if (design.packages.pgfplots) lines.push('\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}');
  lines.push('\\usepackage{xcolor}', `\\definecolor{accent}{HTML}{${design.accent.replace('#', '').toUpperCase()}}`);
  if (design.packages.hyperref) {
    lines.push(beamer
      ? '\\hypersetup{colorlinks=true,linkcolor=accent,urlcolor=accent}'
      : '\\usepackage[colorlinks=true,linkcolor=accent,urlcolor=accent]{hyperref}');
  }
  lines.push('\\usepackage{setspace}', `\\setstretch{${design.lineSpacing}}`);
  if (!beamer && (design.pageNumbers || design.header)) {
    lines.push('\\usepackage{fancyhdr}', '\\pagestyle{fancy}', '\\fancyhf{}');
    if (design.header) lines.push(`\\fancyhead[L]{${design.header}}`);
    if (design.pageNumbers) lines.push('\\fancyfoot[C]{\\thepage}');
  }
  if (!beamer) {
    lines.push('\\usepackage{titlesec}');
    lines.push(
      design.headingFont === 'sans'
        ? '\\titleformat{\\section}{\\Large\\sffamily\\bfseries\\color{accent}}{\\thesection}{0.6em}{}'
        : '\\titleformat{\\section}{\\Large\\bfseries\\color{accent}}{\\thesection}{0.6em}{}',
    );
  }
  if (chinese) {
    lines.push('\\ctexset{section/format=\\Large\\bfseries\\sffamily\\color{accent}}');
  }
  if (design.toc && !beamer) lines.push('\\setcounter{tocdepth}{2}');
  lines.push('', '\\title{ {{title}} }', '\\author{ {{author}} }', '\\date{\\today}', '');
  lines.push('\\begin{document}');
  if (beamer) {
    lines.push('\\begin{frame}', '  \\titlepage', '\\end{frame}', '');
    lines.push('\\begin{frame}{Introduction}', '  Start writing your slides here.', '\\end{frame}', '');
    lines.push('\\end{document}', '');
    return lines.join('\n');
  }
  if (design.titleStyle === 'left') lines.push('\\begin{flushleft}');
  lines.push('\\maketitle');
  if (design.titleStyle === 'left') lines.push('\\end{flushleft}');
  if (design.toc) lines.push('', '\\tableofcontents', '\\newpage');
  if (design.abstract) {
    lines.push('', '\\begin{abstract}', '  A short abstract. Replace this with the argument of your document.', '\\end{abstract}');
  }
  const section = design.base === 'report' ? 'chapter' : 'section';
  lines.push('', `\\${section}{Introduction}`, 'Start writing here. Inline math such as $e^{i\\pi}+1=0$ renders in the editor.', '');
  lines.push(`\\${section}{Method}`, 'Describe the method, data and results.', '');
  lines.push('\\begin{equation}', '  \\label{eq:main}', '  E = mc^2', '\\end{equation}', '');
  lines.push(`\\${section}{Conclusion}`, 'Summarize the contribution.', '');
  lines.push('\\end{document}', '');
  return lines.join('\n');
}
