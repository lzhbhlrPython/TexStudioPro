import type { TemplateItem } from '../types';

export interface TemplateMeta {
  projectName: string;
  title: string;
  author: string;
}

export const builtinTemplates: TemplateItem[] = [
  {
    id: 'article',
    name: 'Article',
    description: 'A clean single-column article.',
    category: 'Basics',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage[colorlinks=true,linkcolor=blue,urlcolor=blue]{hyperref}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
A short abstract goes here. Replace it with the argument of your paper.
\end{abstract}

\section{Introduction}
Start writing here. Inline math such as $e^{i\pi}+1=0$ renders in the editor.

\section{Method}
\begin{equation}
  \label{eq:main}
  E = mc^2
\end{equation}

Equation~\eqref{eq:main} can be referenced from anywhere in the project.

\section{Conclusion}
The source remains a normal, portable \LaTeX{} file.

\end{document}
`,
  },
  {
    id: 'report',
    name: 'Report',
    description: 'A chaptered report with a table of contents.',
    category: 'Academic',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[11pt,a4paper]{report}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle
\tableofcontents

\chapter{Introduction}
\section{Motivation}
Write the motivation here.

\section{Contributions}
\begin{itemize}
  \item First contribution.
  \item Second contribution.
\end{itemize}

\chapter{Methods}
\section{Model}
\begin{equation}
  \label{eq:model}
  \mathcal{L}(\theta) = \sum_{i=1}^{n} \ell(y_i, f_\theta(x_i))
\end{equation}

\chapter{Results}
Present the results and reference Equation~\eqref{eq:model}.

\end{document}
`,
  },
  {
    id: 'beamer',
    name: 'Beamer slides',
    description: 'A presentation with a title slide and one content frame.',
    category: 'Teaching',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[aspectratio=169]{beamer}
\usetheme{default}
\usecolortheme{default}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}

\frame{\titlepage}

\begin{frame}{Overview}
  \begin{itemize}
    \item A visual LaTeX workflow.
    \item Compile with \texttt{latexmk}.
    \item Jump between source and PDF with SyncTeX.
  \end{itemize}
\end{frame}

\begin{frame}{A formula}
  \begin{equation}
    \int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
  \end{equation}
\end{frame}

\end{document}
`,
  },
  {
    id: 'letter',
    name: 'Letter',
    description: 'A formal letter with sender and recipient blocks.',
    category: 'Basics',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{letter}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}

\signature{ {{author}} }
\address{Your street\\Your city\\Your country}

\begin{document}
\begin{letter}{Recipient name\\Recipient street\\Recipient city}
\opening{Dear Recipient,}

Write the body of your letter here. Keep the source readable and let the
visual editor show you the final shape.

\closing{Sincerely,}
\end{letter}
\end{document}
`,
  },
  {
    id: 'ctex-article',
    name: 'Chinese article (ctex)',
    description: 'A XeLaTeX article using ctex for Chinese typesetting.',
    category: 'Academic',
    engine: 'xelatex',
    builtin: true,
    content: String.raw`\documentclass[UTF8,fontset=fandol,11pt]{ctexart}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage{indentfirst}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}
\ctexset{
  section/format = \Large\bfseries,
  subsection/format = \large\bfseries,
}
\setlength{\parindent}{2em}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
在这里写摘要。中文排版由 ctex 处理，编译引擎请使用 XeLaTeX。
\end{abstract}

\section{引言}
从这里开始写作。行内公式 $e^{i\pi}+1=0$ 会在编辑器中就地呈现。

\section{方法}
\begin{equation}
  \label{eq:energy}
  E = mc^2
\end{equation}

公式~\eqref{eq:energy} 可以在项目中的任何位置引用。

\section{结论}
源文件仍然是标准的、可移植的 \LaTeX{} 文件。

\end{document}
`,
  },
  {
    id: 'problem-set',
    name: 'Problem set',
    description: 'A homework/problem set with numbered exercises.',
    category: 'Teaching',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=2.2cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{enumitem}
\usepackage{microtype}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\section*{Instructions}
Show your work. You may use the visual editor to check formulas.

\begin{enumerate}[label=\textbf{\arabic*.}]
  \item Compute the following integral:
    \begin{equation*}
      \int_0^1 x^2\,dx
    \end{equation*}
  \item Prove that $e^{i\pi}+1=0$.
  \item Let $f(x)=x^2$. Find $f'(x)$ and sketch the graph.
\end{enumerate}

\end{document}
`,
  },
  {
    id: 'two-column',
    name: 'Two-column article',
    description: 'A compact two-column layout for papers and reports.',
    category: 'Academic',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[10pt,twocolumn]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=1.8cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
A concise abstract for a two-column paper.
\end{abstract}

\section{Introduction}
Two-column layouts are common in conference papers and short reports.

\section{Method}
\begin{equation}
  \label{eq:model}
  \mathcal{L}(\theta) = \frac{1}{n}\sum_{i=1}^{n} \ell(y_i, f_\theta(x_i))
\end{equation}

\section{Results}
Refer to Equation~\eqref{eq:model} and keep the prose compact.

\end{document}
`,
  },
  {
    id: 'thesis',
    name: 'Thesis',
    description: 'A report-class thesis skeleton with chapters and a title page.',
    category: 'Academic',
    engine: 'pdflatex',
    builtin: true,
    content: String.raw`\documentclass[12pt,a4paper]{report}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[margin=3cm]{geometry}
\usepackage{setspace}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue]{hyperref}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}
\onehalfspacing

\begin{document}
\maketitle
\tableofcontents
\listoffigures
\listoftables

\chapter{Introduction}
\section{Motivation}
State the research problem and why it matters.

\section{Contributions}
\begin{enumerate}
  \item First contribution.
  \item Second contribution.
\end{enumerate}

\chapter{Related Work}
Summarize the relevant literature.

\chapter{Method}
\begin{equation}
  \label{eq:thesis}
  \min_{\theta} \; \mathbb{E}_{(x,y)\sim\mathcal{D}}[\ell(y, f_\theta(x))]
\end{equation}

\chapter{Experiments}
Present the setup, results and ablation studies.

\chapter{Conclusion}
Summarize the findings and future work.

\end{document}
`,
  },
  {
    id: 'japanese-article',
    name: 'Japanese article (luatexja)',
    description: 'A LuaLaTeX article with Japanese line breaking and fonts.',
    category: 'Languages',
    engine: 'lualatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{ltjsarticle}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{microtype}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
ここに概要を書きます。日本語の組版は luatexja が担当します。
\end{abstract}

\section{はじめに}
ここから本文を書き始めます。インライン数式 $e^{i\pi}+1=0$ もそのまま使えます。

\section{手法}
\begin{equation}
  \label{eq:energy}
  E = mc^2
\end{equation}

\section{おわりに}
原稿は通常の \LaTeX{} ファイルのままです。

\end{document}
`,
  },
  {
    id: 'arabic-article',
    name: 'Arabic article (polyglossia)',
    description: 'A XeLaTeX article with Arabic shaping and right-to-left text.',
    category: 'Languages',
    engine: 'xelatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}
\usepackage{fontspec}
\setmainfont{Arial}
\newfontfamily\arabicfont[Script=Arabic]{Al Nile}
\usepackage{polyglossia}
\setmainlanguage{arabic}
\setotherlanguage{english}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
هذا ملخص قصير يشرح فكرة المستند.
\end{abstract}

\section{مقدمة}
نبدأ الكتابة هنا. يمكن استخدام الرياضيات مثل $e^{i\pi}+1=0$ داخل النص.

\section{الطريقة}
\begin{equation}
  \label{eq:energy}
  E = mc^2
\end{equation}

\section{الخاتمة}
يبقى الملف ملفاً عادياً وقابلاً للنقل.

\end{document}
`,
  },
  {
    id: 'russian-article',
    name: 'Russian article (polyglossia)',
    description: 'A XeLaTeX article with Russian hyphenation and Cyrillic fonts.',
    category: 'Languages',
    engine: 'xelatex',
    builtin: true,
    content: String.raw`\documentclass[11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[colorlinks=true,linkcolor=blue]{hyperref}
\usepackage{fontspec}
\setmainfont{Arial}
\usepackage{polyglossia}
\setmainlanguage{russian}
\setotherlanguage{english}

\title{ {{title}} }
\author{ {{author}} }
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Краткое описание документа.
\end{abstract}

\section{Введение}
Здесь начинается текст. Формулы, такие как $e^{i\pi}+1=0$, работают как обычно.

\section{Метод}
\begin{equation}
  \label{eq:energy}
  E = mc^2
\end{equation}

\section{Заключение}
Исходный файл остаётся обычным файлом \LaTeX{}.

\end{document}
`,
  },

];

export function fillTemplate(content: string, meta: TemplateMeta): string {
  return content
    .replace(/\{\{\s*title\s*\}\}/g, escapeLatex(meta.title || 'Untitled'))
    .replace(/\{\{\s*author\s*\}\}/g, escapeLatex(meta.author || 'Author'))
    .replace(/\{\{\s*date\s*\}\}/g, '\\today');
}

export function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return slug || 'untitled';
}
