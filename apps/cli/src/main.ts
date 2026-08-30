#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_FILE,
  ProjectIndex,
  defaultConfigJson
} from '@shishan/core';
import type { Diagnostic, ProjectSnapshot } from '@shishan/protocol';
import { createShiShanServer } from './server.js';

interface ParsedArguments {
  command: string;
  root: string;
  flags: Map<string, string | true>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const command = argv[0] ?? 'help';
  const flags = new Map<string, string | true>();
  let root = '.';
  let rootAssigned = false;
  const valueFlags = new Set(['host', 'port', 'out']);

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) {
      continue;
    }
    if (value.startsWith('--')) {
      const [name, inline] = value.slice(2).split('=', 2);
      if (!name) {
        continue;
      }
      if (inline !== undefined) {
        flags.set(name, inline);
      } else if (valueFlags.has(name)) {
        const next = argv[index + 1];
        if (next && !next.startsWith('--')) {
          flags.set(name, next);
          index += 1;
        } else {
          flags.set(name, true);
        }
      } else {
        flags.set(name, true);
      }
    } else if (!rootAssigned) {
      root = value;
      rootAssigned = true;
    }
  }

  return { command, root: resolve(root), flags };
}

function help(): string {
  return [
    'ShiShan — local code narrative explorer',
    '',
    'Usage:',
    '  shishan init [root]',
    '  shishan scan [root] [--json]',
    '  shishan check [root] [--strict]',
    '  shishan export [root] [--out path]',
    '  shishan serve [root] [--host 127.0.0.1] [--port 4173]',
    '',
    'The server sends a complete snapshot once, then file-level patches only.'
  ].join('\n');
}

function allDiagnostics(snapshot: ProjectSnapshot): Diagnostic[] {
  return snapshot.files.flatMap((file) => file.diagnostics);
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const position = diagnostic.range
    ? ':' +
      (diagnostic.range.start.line + 1) +
      ':' +
      (diagnostic.range.start.column + 1)
    : '';
  return (
    diagnostic.severity.toUpperCase() +
    ' ' +
    diagnostic.code +
    ' ' +
    diagnostic.path +
    position +
    ' — ' +
    diagnostic.message
  );
}

async function scan(root: string, json: boolean): Promise<void> {
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  if (json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  const diagnostics = allDiagnostics(snapshot);
  console.log(
    [
      'Scanned ' + snapshot.coverage.files + ' files.',
      'Narrated functions: ' +
        snapshot.coverage.narratedFunctions +
        '/' +
        snapshot.coverage.totalFunctions +
        ' (' +
        snapshot.coverage.percent +
        '%).',
      'Flow nodes: ' +
        snapshot.coverage.flowNodes +
        '; details: ' +
        snapshot.coverage.details +
        '.',
      'Diagnostics: ' + diagnostics.length + '.',
      'Parse operations: ' + snapshot.metrics.totalParseOperations + '.'
    ].join('\n')
  );
}

async function check(root: string, strict: boolean): Promise<void> {
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  const diagnostics = allDiagnostics(snapshot);
  for (const diagnostic of diagnostics) {
    console.log(formatDiagnostic(diagnostic));
  }
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length;
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length;
  console.log(
    'Check complete: ' +
      errors +
      ' errors, ' +
      warnings +
      ' warnings, coverage ' +
      snapshot.coverage.percent +
      '%.'
  );
  if (errors > 0 || (strict && warnings > 0)) {
    process.exitCode = 1;
  }
}

async function exportSnapshot(
  root: string,
  output: string | true | undefined
): Promise<void> {
  if (output === true) {
    throw new Error('--out requires a file path.');
  }
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  const json = JSON.stringify(snapshot, null, 2) + '\n';
  if (typeof output === 'string') {
    const path = resolve(root, output);
    await writeFile(path, json, 'utf8');
    console.log('Wrote ' + path);
  } else {
    process.stdout.write(json);
  }
}

async function init(root: string): Promise<void> {
  const path = resolve(root, CONFIG_FILE);
  try {
    await writeFile(path, defaultConfigJson(), {
      encoding: 'utf8',
      flag: 'wx'
    });
    console.log('Created ' + path);
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'EEXIST') {
      console.log(path + ' already exists; left it unchanged.');
      return;
    }
    throw error;
  }
}

async function serve(arguments_: ParsedArguments): Promise<void> {
  const portValue = arguments_.flags.get('port');
  if (portValue === true) {
    throw new Error('--port requires a numeric value.');
  }
  const port =
    typeof portValue === 'string' ? Number.parseInt(portValue, 10) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new Error('--port must be an integer from 1 to 65535.');
  }
  const hostValue = arguments_.flags.get('host');
  if (hostValue === true) {
    throw new Error('--host requires a loopback hostname.');
  }
  const host = typeof hostValue === 'string' ? hostValue : undefined;
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
  const server = await createShiShanServer({
    root: arguments_.root,
    host,
    port,
    webRoot,
    watch: true
  });
  let address: string;
  try {
    address = await server.start();
  } catch (error) {
    await server.close();
    throw error;
  }
  console.log('ShiShan is available at ' + address);
  console.log('Watching source files; updates are emitted as file-level patches.');

  const close = async (): Promise<void> => {
    await server.close();
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  switch (arguments_.command) {
    case 'init':
      await init(arguments_.root);
      break;
    case 'scan':
      await scan(arguments_.root, arguments_.flags.has('json'));
      break;
    case 'check':
      await check(arguments_.root, arguments_.flags.has('strict'));
      break;
    case 'export':
      await exportSnapshot(arguments_.root, arguments_.flags.get('out'));
      break;
    case 'serve':
      await serve(arguments_);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(help());
      break;
    default:
      console.error('Unknown command: ' + arguments_.command);
      console.error(help());
      process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
