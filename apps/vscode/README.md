# ShiShan Code Narrative for VS Code

ShiShan adds a dedicated Activity Bar container for the project’s named
narrative flows. `Narrative Preview` renders the manifest as expandable node
cards without opening a browser. Each card has Overview, Function flow, and
Implementation levels; nested data is loaded lazily from the local CLI only
when requested. `Project Outline` keeps the compact tree and source-symbol
navigation.

The view title contains three actions:

- **Open Project Narrative** starts the local ShiShan server and opens the Web
  Overview.
- **Refresh Project Narrative** reloads the manifest tree.
- **Check Narrative Freshness** runs the strict CLI check in the workspace.

Set `shishan.language` to `auto`, `en`, or `zh-cn` to control runtime labels and
the Web overview opened by the extension. Narrative text authored in source or
the manifest is displayed verbatim.

## CLI path

The extension remains a thin adapter and does not ship a second parser. In a
ShiShan source checkout it finds `apps/cli/dist/main.js` automatically. In any
other repository, set `shishan.cliPath` to the built ShiShan CLI entry file.

## Local VSIX

From the repository root:

```bash
npm run package -w shishan-vscode
code --install-extension apps/vscode/shishan-vscode-0.3.0.vsix --force
```
