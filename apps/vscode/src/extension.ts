import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { get } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import * as vscode from 'vscode';
import {
  extensionText,
  resolveExtensionLocale,
  type ExtensionLocale,
  type ExtensionMessageKey
} from './i18n.js';
import { NarrativePreviewProvider } from './narrative-preview.js';
import { extractNodeDrilldown, type PreviewSourceRange } from './preview-model.js';
import { resolveExistingSourceTarget } from './source-target.js';
import {
  parseProjectManifest,
  type ProjectManifestFlow,
  type ProjectManifestNode,
  type ProjectManifestParseResult
} from './project-manifest.js';

interface ManagedServer {
  root: string;
  port: number;
  process: ChildProcessWithoutNullStreams;
}

const servers = new Map<string, ManagedServer>();
let output: vscode.OutputChannel;
const PROJECT_MANIFEST = '.shishan/project.json';
const MAX_PROJECT_MANIFEST_BYTES = 256 * 1024;
const MAX_PROJECT_SNAPSHOT_BYTES = 64 * 1024 * 1024;

function currentLocale(): ExtensionLocale {
  return resolveExtensionLocale(
    vscode.workspace
      .getConfiguration('shishan')
      .get<string>('language', 'auto'),
    vscode.env.language
  );
}

function t(
  key: ExtensionMessageKey,
  values?: Readonly<Record<string, string | number>>
): string {
  return extensionText(currentLocale(), key, values);
}

class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly flow?: ProjectManifestFlow,
    readonly node?: ProjectManifestNode
  ) {
    super(label, collapsibleState);
  }
}

const nodeIcons: Record<string, string> = {
  entry: 'debug-start',
  module: 'symbol-module',
  process: 'gear',
  decision: 'git-branch',
  error: 'error',
  output: 'sign-out',
  external: 'cloud'
};

const nodeKindKeys: Record<string, ExtensionMessageKey> = {
  entry: 'kindEntry',
  module: 'kindModule',
  process: 'kindProcess',
  decision: 'kindDecision',
  error: 'kindError',
  output: 'kindOutput',
  external: 'kindExternal'
};

class ProjectNarrativeProvider
  implements vscode.TreeDataProvider<ProjectTreeItem>, vscode.Disposable
{
  readonly #changes = new vscode.EventEmitter<ProjectTreeItem | undefined>();
  readonly onDidChangeTreeData = this.#changes.event;

  refresh(): void {
    this.#changes.fire(undefined);
  }

  dispose(): void {
    this.#changes.dispose();
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (element?.flow) {
      return element.flow.nodes.map((node) => {
        const kindKey = nodeKindKeys[node.kind];
        const item = new ProjectTreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          node
        );
        item.id = 'shishan-node:' + element.flow?.id + ':' + node.id;
        item.description =
          node.source?.symbol ??
          (kindKey ? t(kindKey) : node.kind);
        item.contextValue = node.source
          ? 'shishanProjectNodeWithSource'
          : 'shishanProjectNode';
        item.iconPath = new vscode.ThemeIcon(nodeIcons[node.kind] ?? 'circle-outline');
        item.tooltip = new vscode.MarkdownString(
          '**' + node.label + '**\n\n' +
            node.summary +
            (node.source
              ? '\n\n`' +
                node.source.path +
                (node.source.symbol ? ' · ' + node.source.symbol : '') +
                '`'
              : '')
        );
        if (node.source) {
          item.command = {
            command: 'shishan.openProjectSource',
            title: t('openSource'),
            arguments: [node]
          };
        }
        return item;
      });
    }

    const result = await readProjectManifest();
    if (!result.manifest) {
      return result.error ? [this.errorItem(result.error)] : [];
    }
    return result.manifest.flows.map((flow) => {
      const item = new ProjectTreeItem(
        flow.title,
        flow.id === result.manifest?.entryFlow
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
        flow
      );
      item.id = 'shishan-flow:' + flow.id;
      item.description = t('nodes', { count: flow.nodes.length });
      item.contextValue = 'shishanProjectFlow';
      item.iconPath = new vscode.ThemeIcon(
        flow.id === result.manifest?.entryFlow ? 'type-hierarchy' : 'list-tree'
      );
      item.tooltip = new vscode.MarkdownString(
        '**' + flow.title + '**\n\n' + flow.summary
      );
      return item;
    });
  }

  private errorItem(message: string): ProjectTreeItem {
    const item = new ProjectTreeItem(
      t('invalidNarrative'),
      vscode.TreeItemCollapsibleState.None
    );
    item.description = t('openOutput');
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = message;
    item.command = {
      command: 'shishan.showProjectError',
      title: t('openOutput'),
      arguments: [message]
    };
    return item;
  }
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function readProjectManifest(): Promise<ProjectManifestParseResult> {
  const root = workspaceRoot();
  if (!root) {
    return {};
  }
  const uri = vscode.Uri.joinPath(vscode.Uri.file(root), PROJECT_MANIFEST);
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return {};
  }
  if (bytes.byteLength > MAX_PROJECT_MANIFEST_BYTES) {
    return { error: 'project.json exceeds the 256 KiB safety limit.' };
  }
  return parseProjectManifest(new TextDecoder().decode(bytes));
}

async function existingPath(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

// @shishan function find-cli
// @summary Locate a built ShiShan CLI without invoking a shell
// @input root
// @output absolute CLI entry path
async function findCli(root: string): Promise<string | undefined> {
  const configured = vscode.workspace
    .getConfiguration('shishan')
    .get<string>('cliPath', '')
    .trim();
  const candidates = [
    configured
      ? isAbsolute(configured)
        ? configured
        : resolve(root, configured)
      : undefined,
    resolve(root, 'apps/cli/dist/main.js'),
    resolve(root, 'node_modules/@shishan/cli/dist/main.js')
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    const found = await existingPath(candidate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function waitForServer(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveReady, reject) => {
    const attempt = (): void => {
      const request = get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) {
          resolveReady();
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(1_000, () => request.destroy());
    };
    const retry = (): void => {
      if (Date.now() >= deadline) {
        reject(new Error('ShiShan server did not become ready within 10 seconds.'));
        return;
      }
      setTimeout(attempt, 200);
    };
    attempt();
  });
}

function readProjectSnapshot(url: string): Promise<unknown> {
  return new Promise((resolveSnapshot, reject) => {
    const request = get(url, (response) => {
      if ((response.statusCode ?? 500) >= 400) {
        response.resume();
        reject(
          new Error(
            'ShiShan project snapshot failed with ' + response.statusCode + '.'
          )
        );
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > MAX_PROJECT_SNAPSHOT_BYTES) {
          response.destroy(
            new Error('ShiShan project snapshot exceeds the 64 MiB safety limit.')
          );
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolveSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('error', reject);
    request.setTimeout(10_000, () => {
      request.destroy(new Error('ShiShan project snapshot timed out.'));
    });
  });
}

function attachOutput(child: ChildProcessWithoutNullStreams): void {
  child.stdout.on('data', (chunk: Buffer) => output.append(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => output.append(chunk.toString()));
}

function spawnEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  };
}

function processFailure(
  child: ChildProcessWithoutNullStreams
): Promise<never> {
  return new Promise((_resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          'ShiShan CLI exited before startup (' +
            (signal ? 'signal ' + signal : 'code ' + code) +
            ').'
        )
      );
    });
  });
}

// @shishan function start-server
// @summary Start or reuse the loopback ShiShan server for one workspace
// @input root
// @input cliPath
// @output local narrative URL
async function startServer(root: string, cliPath: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('shishan');
  const port = config.get<number>('port', 4173);
  const base = config.get<string>('freshnessBase', 'HEAD').trim() || 'HEAD';
  const existing = servers.get(root);
  if (existing && existing.port === port && existing.process.exitCode === null) {
    return 'http://127.0.0.1:' + port;
  }
  if (existing) {
    existing.process.kill('SIGTERM');
    servers.delete(root);
  }

  const child = spawn(
    process.execPath,
    [
      cliPath,
      'serve',
      root,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--base',
      base
    ],
    { cwd: root, env: spawnEnvironment(), stdio: 'pipe' }
  );
  attachOutput(child);
  const managed = { root, port, process: child };
  servers.set(root, managed);
  child.once('exit', () => {
    if (servers.get(root)?.process === child) {
      servers.delete(root);
    }
  });

  const url = 'http://127.0.0.1:' + port;
  try {
    await Promise.race([waitForServer(url), processFailure(child)]);
    return url;
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function runCheck(root: string, cliPath: string): Promise<void> {
  const base =
    vscode.workspace
      .getConfiguration('shishan')
      .get<string>('freshnessBase', 'HEAD')
      .trim() || 'HEAD';
  output.show(true);
  output.appendLine('\n$ shishan check --strict --base ' + base);
  const child = spawn(
    process.execPath,
    [cliPath, 'check', root, '--strict', '--base', base],
    { cwd: root, env: spawnEnvironment(), stdio: 'pipe' }
  );
  attachOutput(child);
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', resolveExit);
  });
  if (code === 0) {
    void vscode.window.showInformationMessage(t('checkPassed'));
  } else {
    void vscode.window.showErrorMessage(t('checkFailed'));
  }
}

async function requireWorkspaceAndCli(): Promise<
  { root: string; cliPath: string } | undefined
> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showErrorMessage(t('openWorkspace'));
    return undefined;
  }
  const cliPath = await findCli(root);
  if (!cliPath) {
    void vscode.window.showErrorMessage(t('cliMissing'));
    return undefined;
  }
  return { root, cliPath };
}

async function openNarrative(): Promise<void> {
  const context = await requireWorkspaceAndCli();
  if (!context) {
    return;
  }
  try {
    const url = await startServer(context.root, context.cliPath);
    const params = new URLSearchParams({
      view: 'overview',
      lang: currentLocale()
    });
    await vscode.commands.executeCommand(
      'simpleBrowser.show',
      url + '/?' + params.toString()
    );
  } catch (error) {
    output.show(true);
    void vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkNarrative(): Promise<void> {
  const context = await requireWorkspaceAndCli();
  if (!context) {
    return;
  }
  try {
    await runCheck(context.root, context.cliPath);
  } catch (error) {
    output.show(true);
    void vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function openSourceUri(uri: vscode.Uri): Promise<void> {
  if (uri.path !== '/open') {
    return;
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const target = await resolveExistingSourceTarget(
      folder.uri.fsPath,
      uri.query
    );
    if (!target) {
      continue;
    }
    const document = await vscode.workspace.openTextDocument(target.path);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(target.line - 1, target.column - 1);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
    return;
  }
  void vscode.window.showErrorMessage(
    t('unsafeSource')
  );
}

function findSymbolRange(
  symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
  name: string
): vscode.Range | undefined {
  for (const symbol of symbols) {
    if (symbol.name === name) {
      return 'location' in symbol ? symbol.location.range : symbol.selectionRange;
    }
    if (!('location' in symbol)) {
      const nested = findSymbolRange(symbol.children, name);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

async function openProjectSource(node: ProjectManifestNode): Promise<void> {
  const root = workspaceRoot();
  if (!root || !node.source) {
    return;
  }
  const query = new URLSearchParams({ path: node.source.path }).toString();
  const target = await resolveExistingSourceTarget(root, query);
  if (!target) {
    void vscode.window.showErrorMessage(
      t('unsafeSource')
    );
    return;
  }
  const document = await vscode.workspace.openTextDocument(target.path);
  let range: vscode.Range | undefined;
  if (node.source.symbol) {
    const symbols = await vscode.commands.executeCommand<
      Array<vscode.DocumentSymbol | vscode.SymbolInformation> | undefined
    >('vscode.executeDocumentSymbolProvider', document.uri);
    range = symbols
      ? findSymbolRange(symbols, node.source.symbol)
      : undefined;
  }
  const editor = await vscode.window.showTextDocument(document);
  const position = range?.start ?? new vscode.Position(0, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    range ?? new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
}

async function openPreviewRange(range: PreviewSourceRange): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    return;
  }
  const query = new URLSearchParams({
    path: range.path,
    line: String(range.start.line + 1),
    column: String(range.start.column + 1)
  }).toString();
  const target = await resolveExistingSourceTarget(root, query);
  if (!target) {
    void vscode.window.showErrorMessage(t('unsafeSource'));
    return;
  }
  const document = await vscode.workspace.openTextDocument(target.path);
  const requested = new vscode.Range(
    new vscode.Position(range.start.line, range.start.column),
    new vscode.Position(range.end.line, range.end.column)
  );
  const selected = document.validateRange(requested);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(selected.start, selected.end);
  editor.revealRange(
    selected,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
}

// @shishan function load-preview-node-details
// @summary Reuse the local CLI snapshot to populate one expanded VS Code node
// @input project flow and node identifiers
// @output bounded nested narrative and detail model
async function loadPreviewNodeDetails(
  flowId: string,
  nodeId: string
) {
  const context = await requireWorkspaceAndCli();
  if (!context) {
    return { narrativeFound: false, outline: [], details: [] };
  }
  const url = await startServer(context.root, context.cliPath);
  const snapshot = await readProjectSnapshot(url + '/api/project');
  return extractNodeDrilldown(snapshot, flowId, nodeId);
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('ShiShan');
  const provider = new ProjectNarrativeProvider();
  const preview = new NarrativePreviewProvider({
    locale: currentLocale,
    readManifest: readProjectManifest,
    loadNodeDetails: loadPreviewNodeDetails,
    openSource: openProjectSource,
    openRange: openPreviewRange,
    openWeb: openNarrative
  });
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.shishan/project.json'
  );
  const refresh = (): void => {
    provider.refresh();
    void preview.refresh();
  };
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);
  context.subscriptions.push(
    output,
    provider,
    preview,
    watcher,
    vscode.window.createTreeView('shishan.projectNarrative', {
      treeDataProvider: provider,
      showCollapseAll: true
    }),
    vscode.window.registerWebviewViewProvider(
      'shishan.narrativePreview',
      preview,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand('shishan.openNarrative', openNarrative),
    vscode.commands.registerCommand('shishan.checkNarrative', checkNarrative),
    vscode.commands.registerCommand('shishan.refreshProjectNarrative', refresh),
    vscode.commands.registerCommand(
      'shishan.openProjectSource',
      openProjectSource
    ),
    vscode.commands.registerCommand(
      'shishan.showProjectError',
      (message: string) => {
        output.appendLine('Project narrative: ' + message);
        output.show(true);
      }
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('shishan.language')) {
        provider.refresh();
        void preview.refreshLocale();
      }
    }),
    vscode.window.registerUriHandler({ handleUri: openSourceUri })
  );
}

export function deactivate(): void {
  for (const server of servers.values()) {
    server.process.kill('SIGTERM');
  }
  servers.clear();
}
