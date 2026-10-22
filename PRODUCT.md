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

TeXPro is a writing-first LaTeX application. Continuous composition and revision are its primary capabilities; inline rendering and visual tools assist that work. It keeps ordinary `.tex` source as the document of record while rendering formulas, headings, tables, figures, code blocks, citations, and TikZ diagrams in place. Success means an author can keep writing across content types, then compile and maintain the project without losing their place, selection, or control.

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

- **Writing comes first:** every interaction must serve continuous writing. Learn from Typora's editing behavior, not only its paper appearance. This applies equally to prose, formulas, tables, music, circuit diagrams, logic gates, chemical structural formulas, skeletal formulas, and other document content. Visualization is auxiliary; ordinary content entry and revision must not require a studio, configuration form, or apply/finish ceremony. This is a product requirement for future changes, not a claim that every existing interaction already meets it.
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
- Automated evidence: `scripts/test-compile.mjs` (19 checks), `scripts/test-import.mjs` (12 checks), `scripts/test-mcp.mjs`, `tests/reliability.test.cjs`, native-input Electron UI regressions, and the Electron smoke flow.
- Public repository: `https://github.com/lzhbhlrPython/TexStudioPro`.

There are no confirmed customer testimonials, case studies, commercial benchmarks, or production deployment claims. Future work must not invent them.

Release builds validate renderer assets before packing and inspect the resulting ASAR afterward. CI packaging alone is not desktop runtime acceptance.

## Product Principles

1. **Protect continuous writing.** Treat prose, formulas, table cells, music, circuit diagrams, logic gates, chemical structural formulas, skeletal formulas, and other document content as parts of one writing flow. Enter, revise, and leave content with predictable caret and keyboard behavior. Direct text entry remains primary; a visual helper must not automatically take over focus or demand a separate completion step.
2. **Source is the document of record.** Keep ordinary, portable LaTeX authoritative and always accessible in context. Source authority does not mean forcing every ordinary edit into raw markup: direct cell text entry and inline rendered content can still serve writing.
3. **Keep assistance contextual and optional.** Preserve the quiet paper surface. Show only tools relevant to an explicit selection or request; moving a configuration form into the document does not make it continuous writing. Studios are optional helpers rather than the default route for routine content edits.
4. **Preserve the author's place.** Preview updates, validation, package insertion, background compilation, and auxiliary tools must preserve the active file, caret, selection, undo history, and writing position. IME composition and incomplete input must remain editable while rendering catches up.
5. **Close the loop.** Writing, project structure, compile diagnostics, PDF, references, and versioning should meet in the same workspace, with a consistent selected main file.
6. **Make automation inspectable.** AI, MCP, custom actions, and backups must expose what they run and stay reversible.
7. **Local by default, explicit when remote.** Network, cloud, and collaboration are choices with visible boundaries.

## Accessibility & Inclusion

- Keyboard-first editing and command access; visible focus rings on interactive controls.
- Reduced-motion support for modal and menu animations.
- Bilingual Chinese/English UI with code and technical content kept readable in either language.
- No confirmed formal accessibility standard (for example WCAG level) has been adopted; this is an open decision.
