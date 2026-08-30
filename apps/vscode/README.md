# ShiShan Code Narrative for VS Code

ShiShan adds a dedicated Activity Bar view for the project’s named narrative
flows. The tree reads the version-controlled `.shishan/project.json` manifest,
shows its flows and nodes, and opens a node’s declared source symbol.

The view title contains three actions:

- **Open Project Narrative** starts the local ShiShan server and opens the Web
  Overview.
- **Refresh Project Narrative** reloads the manifest tree.
- **Check Narrative Freshness** runs the strict CLI check in the workspace.

## CLI path

The extension remains a thin adapter and does not ship a second parser. In a
ShiShan source checkout it finds `apps/cli/dist/main.js` automatically. In any
other repository, set `shishan.cliPath` to the built ShiShan CLI entry file.

## Local VSIX

From the repository root:

```bash
npm run package -w shishan-vscode
code --install-extension apps/vscode/shishan-vscode-0.2.0.vsix --force
```
