# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron desktop application with a React 19 + Vite + TypeScript renderer, CodeMirror 6 editing surface, PDF.js preview, and a Node.js main process. macOS is the primary development machine; UI behavior should remain coherent on Windows and Linux.

## Users

Mixed audience, confirmed rather than narrowed:

- Academic researchers and graduate students writing papers, reports, and theses who need LaTeX project structure, citations, PDF comparison, and typographic control.
- Students writing coursework and degree documents who value templates, Chinese typesetting, and a lower learning curve.
- Technical and multi-document authors working on books, manuals, and modular projects who need a directory tree, table of contents, version review, and collaboration.

Their common job is to write and revise real LaTeX source while seeing a faithful visual representation, then compile, inspect, and navigate the resulting PDF without leaving the project.

## Product Purpose

TeXPro is a visual-first LaTeX workbench. It keeps ordinary `.tex` source as the document of record while rendering formulas, headings, tables, figures, code blocks, citations, and TikZ diagrams in place. Success means an author can move between writing, structure, compile diagnostics, PDF, and project maintenance without losing context or control.

## Positioning

The defensible mechanism is the combination of **Typora-style inline authoring** and **TeXstudio-style project closure**: source remains authoritative, the paper-like editing surface is immediate, and project trees, multi-engine compile, SyncTeX, diagnostics, references, and visual project tooling stay connected to the same file. A Markdown editor cannot truthfully claim the LaTeX engineering loop; a traditional LaTeX IDE cannot truthfully claim this writing surface.

## Operating Context

- Users work in local project folders containing `.tex`, `.bib`, assets, and a `.texpro/` metadata directory.
- LaTeX is compiled locally with `latexmk`, pdfLaTeX, XeLaTeX, or LuaLaTeX; TeX Live binaries live outside the app.
- SyncTeX is used for forward and inverse navigation between source and PDF.
- Projects can be opened from the filesystem, created from templates, or imported from Markdown/Typst/Overleaf.
- Local-first work includes optional LAN collaboration, local MCP servers, and explicit backup destinations.
- The app is used on macOS with keyboard shortcuts, trackpad/pen input, and an expectation of native-feeling window behavior.

## Capabilities and Constraints

Confirmed capabilities include:

- Visual editing of LaTeX source with KaTeX math, headings, tables, images, code blocks, labels/references, and TikZ previews.
- Project tree, outline, symbol index, search, autosave, compile strategies, cancellation, and diagnostics.
- PDF search, thumbnails, text layer, spread/presentation modes, SyncTeX, and before/after pixel diff.
- Bibliography management, DOI/arXiv lookup, Zotero Better BibTeX import/search, and citation/label graph.
- Template gallery and template workshop; Markdown/Typst import; Markdown/Typst/HTML export.
- arXiv source packaging, Overfull/Underfull PDF heatmap, spellcheck, smart paste, font coverage.
- Chunked content-addressed version history with manual snapshot, diff, restore, deletion, and GC.
- Handwriting/diagram ink studio, three separate circuit/logic/structure visual studios, ink modeler smoothing.
- WebDAV/iCloud/SSH backups; Git/Overleaf integration; LAN Yjs collaboration.
- MCP server (tools/resources/prompts) and stdio MCP client with persisted server configs, plugin presets, and elicitation forms.
- Configurable TeXstudio `.cwl` completions (including auto-discovered TeXstudio packs), project macros, document-class/package manager, and build actions with `{rootFile}`, `{rootName}`, `{projectRoot}`, and `txs:///` resolution.
- Git-first versioning: when a project has a Git repository, internal snapshot creation is suspended.
- Compile Theater, MCP Crew, Writing Room presence, Plugin Market, Paper as API, Referee Mode, and Zero-interface mode are first-class workflows.

Durable constraints confirmed by the user:

- **Local-first, privacy, reversibility:** project content stays local by default; secrets use the OS keychain where available; version history and backups must be manually controllable and recoverable.
- **Cross-platform consistency:** macOS is the primary environment, but UI and behavior should stay coherent on Windows and Linux.
- The application must not depend on a single fixed compile command; completion, macros, and build actions are user-extensible.

Explicitly undecided or constrained facts:

- No cloud account, hosted sync service, pricing, customer list, benchmark, or deployment claim is established.
- Liquid Glass was explicitly rejected and removed; it is not a product commitment.
- Handwriting recognition (beyond ink capture and optional AI) is not established.

## Brand Commitments

- Product name: **TeXPro**.
- Voice: direct, technical, calm, and precise; bilingual Chinese/English UI.
- Visual identity commitment: Typora-like paper feel, quiet chrome, and a single-column writing surface; Apple Human Interface Guidelines inform hierarchy and interaction quality; Lucide SVG icons.
- The app icon is part of the identity and must remain consistent across Dock, window, bundle, favicon, and in-app logo.
- No Liquid Glass revival without a new explicit decision.

## Evidence on Hand

- Runnable local project at `/Users/liubaolin/Documents/TexStudioPro`.
- Demo project: `demo/main.tex`, `demo/references.bib`, `demo/assets/curve.png`.
- Rendered evidence: `docs/screenshots/` and `artifacts/` smoke captures.
- Automated evidence: `scripts/test-compile.mjs` (19 checks), `scripts/test-import.mjs` (12 checks), `scripts/test-mcp.mjs`, and the Electron smoke flow.
- Public repository: `https://github.com/lzhbhlrPython/TexStudioPro`.

There are no confirmed customer testimonials, case studies, commercial benchmarks, or production deployment claims. Future work must not invent them.

## Product Principles

1. **Source is the document of record.** Visual affordances may be rich, but the file remains ordinary, portable LaTeX.
2. **Keep the writing surface quiet.** Complexity belongs in contextual tools, not permanently in the writing column.
3. **Close the loop.** Writing, project structure, compile diagnostics, PDF, references, and versioning should meet in the same workspace.
4. **Make automation inspectable.** AI, MCP, custom actions, and backups must expose what they run and stay reversible.
5. **Local by default, explicit when remote.** Network, cloud, and collaboration are choices with visible boundaries.

## Accessibility & Inclusion

- Keyboard-first editing and command access; visible focus rings on interactive controls.
- Reduced-motion support for modal and menu animations.
- Bilingual Chinese/English UI with code and technical content kept readable in either language.
- No confirmed formal accessibility standard (for example WCAG level) has been adopted; this is an open decision.
