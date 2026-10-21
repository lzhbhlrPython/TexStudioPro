# TeXPro MCP server

A standalone stdio MCP server exposing TeXPro's project, compile, diagnostics, SyncTeX, TikZ, asset and Bib capabilities to MCP clients.

## Configure

```json
{
  "mcpServers": {
    "texpro": {
      "command": "node",
      "args": [
        "/absolute/path/to/TeXPro/mcp/server.mjs",
        "--project",
        "/absolute/path/to/your-paper"
      ]
    }
  }
}
```

The project can also be supplied with `TEXPRO_PROJECT_ROOT`. The server prints logs to stderr only; stdout is reserved for JSON-RPC.

The app exposes the exact path in **More → MCP server**.

## Tools

| Tool | Purpose |
|---|---|
| `texpro_open_project` | Open a project directory |
| `texpro_project_info` | Root, root file, build dir |
| `texpro_list_files` | Project tree |
| `texpro_read_file` | Read UTF-8 source |
| `texpro_write_file` | Write source inside the project |
| `texpro_search` | Search project sources |
| `texpro_project_symbols` | Labels, cites, packages, images |
| `texpro_diagnose` | TeX tools and project health |
| `texpro_compile` | Run latexmk and return diagnostics |
| `texpro_cancel_compile` | Cancel the active MCP compile |
| `texpro_synctex_forward` | Source → PDF page/coordinates |
| `texpro_synctex_inverse` | PDF page/coordinates → source |
| `texpro_render_tikz` | Render TikZ/pgfplots preview |
| `texpro_list_assets` | List project assets |
| `texpro_bib_lookup` | DOI / arXiv → BibTeX |
| `texpro_template_preview` | Compile template → PNG data URL |

## Security

- All paths are resolved inside the configured project. `..`, absolute paths and symlink escapes are rejected where possible.
- `texpro_write_file` is the only mutating document tool. It is explicit and should be called only with user intent.
- Compilation is local and uses `latexmk`; no cloud service is contacted.
- The server does not expose arbitrary shell execution.

## Test

```bash
npm run test:mcp
```

The test starts the real stdio server against `demo/`, performs initialize, tools/list, project info, search, read and doctor calls.

## Packaging

`mcp/**` is included in Electron's `extraResources`; in a packaged build the UI reports the path under `Contents/Resources/mcp/server.mjs`.
