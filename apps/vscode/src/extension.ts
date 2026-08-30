import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { get } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import * as vscode from 'vscode';
import { resolveExistingSourceTarget } from './source-target.js';

interface ManagedServer {
  root: string;
  port: number;
  process: ChildProcessWithoutNullStreams;
}

const servers = new Map<string, ManagedServer>();
let output: vscode.OutputChannel;

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
    void vscode.window.showInformationMessage('ShiShan narrative check passed.');
  } else {
    void vscode.window.showErrorMessage(
      'ShiShan narrative check failed. See the ShiShan output channel.'
    );
  }
}

async function requireWorkspaceAndCli(): Promise<
  { root: string; cliPath: string } | undefined
> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showErrorMessage('Open a workspace folder before using ShiShan.');
    return undefined;
  }
  const cliPath = await findCli(root);
  if (!cliPath) {
    void vscode.window.showErrorMessage(
      'ShiShan CLI was not found. Build this repository or set shishan.cliPath.'
    );
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
    await vscode.commands.executeCommand('simpleBrowser.show', url);
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
    'ShiShan rejected the source link because it is outside the open workspace or no longer exists.'
  );
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('ShiShan');
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('shishan.openNarrative', openNarrative),
    vscode.commands.registerCommand('shishan.checkNarrative', checkNarrative),
    vscode.window.registerUriHandler({ handleUri: openSourceUri })
  );
}

export function deactivate(): void {
  for (const server of servers.values()) {
    server.process.kill('SIGTERM');
  }
  servers.clear();
}
