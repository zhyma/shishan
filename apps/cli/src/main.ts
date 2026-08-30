#!/usr/bin/env node

import { writeSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_FILE,
  ProjectIndex,
  defaultConfigJson,
  type ProjectIndexOptions
} from '@shishan/core';
import type { Diagnostic, ProjectSnapshot } from '@shishan/protocol';
import { createShiShanServer } from './server.js';
import { exportStaticSite } from './static-export.js';

interface ParsedArguments {
  command: string;
  root: string;
  flags: Map<string, string | true>;
}

function writeStream(fileDescriptor: number, value: string): void {
  const buffer = Buffer.from(value);
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(
      fileDescriptor,
      buffer,
      offset,
      Math.min(64 * 1024, buffer.length - offset)
    );
    if (written <= 0) {
      throw new Error('Could not write CLI output.');
    }
    offset += written;
  }
}

function writeOutput(value: string): void {
  writeStream(1, value + '\n');
}

function writeError(value: string): void {
  writeStream(2, value + '\n');
}

function parseArguments(argv: string[]): ParsedArguments {
  const command = argv[0] ?? 'help';
  const flags = new Map<string, string | true>();
  let root = '.';
  let rootAssigned = false;
  const valueFlags = new Set(['host', 'port', 'out', 'base']);

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
    '  shishan scan [root] [--json] [--base HEAD]',
    '  shishan check [root] [--strict] [--base HEAD]',
    '  shishan export [root] [--out path] [--base HEAD]',
    '  shishan export-site [root] [--out directory] [--include-source] [--base HEAD]',
    '  shishan serve [root] [--host 127.0.0.1] [--port 4173] [--base HEAD]',
    '',
    'Freshness checks compare implementation and narrative changes against Git HEAD.',
    'Use --no-freshness to disable Git comparison.',
    'The server sends a complete snapshot once, then file-level patches only.'
  ].join('\n');
}

function projectOptions(flags: ReadonlyMap<string, string | true>): ProjectIndexOptions {
  if (flags.has('no-freshness')) {
    return {};
  }
  const base = flags.get('base');
  if (base === true) {
    throw new Error('--base requires a Git revision.');
  }
  return {
    freshness: {
      base: typeof base === 'string' ? base : 'HEAD',
      required: typeof base === 'string'
    }
  };
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

async function scan(arguments_: ParsedArguments): Promise<void> {
  const index = await ProjectIndex.create(
    arguments_.root,
    projectOptions(arguments_.flags)
  );
  const snapshot = await index.initialize();
  if (arguments_.flags.has('json')) {
    await writeOutput(JSON.stringify(snapshot, null, 2));
    return;
  }
  const diagnostics = allDiagnostics(snapshot);
  await writeOutput(
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
      'Parse operations: ' + snapshot.metrics.totalParseOperations + '.',
      'Freshness baseline: ' + (index.freshnessBase() ?? 'disabled') + '.'
    ].join('\n')
  );
}

async function check(arguments_: ParsedArguments): Promise<void> {
  const index = await ProjectIndex.create(
    arguments_.root,
    projectOptions(arguments_.flags)
  );
  const snapshot = await index.initialize();
  const diagnostics = allDiagnostics(snapshot);
  for (const diagnostic of diagnostics) {
    await writeOutput(formatDiagnostic(diagnostic));
  }
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length;
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length;
  await writeOutput(
    'Check complete: ' +
      errors +
      ' errors, ' +
      warnings +
      ' warnings, coverage ' +
      snapshot.coverage.percent +
      '%.'
  );
  if (errors > 0 || (arguments_.flags.has('strict') && warnings > 0)) {
    process.exitCode = 1;
  }
}

async function exportSnapshot(
  arguments_: ParsedArguments
): Promise<void> {
  const output = arguments_.flags.get('out');
  if (output === true) {
    throw new Error('--out requires a file path.');
  }
  const index = await ProjectIndex.create(
    arguments_.root,
    projectOptions(arguments_.flags)
  );
  const snapshot = await index.initialize();
  const json = JSON.stringify(snapshot, null, 2) + '\n';
  if (typeof output === 'string') {
    const path = resolve(arguments_.root, output);
    await writeFile(path, json, 'utf8');
    await writeOutput('Wrote ' + path);
  } else {
    writeStream(1, json);
  }
}

async function exportSite(arguments_: ParsedArguments): Promise<void> {
  const output = arguments_.flags.get('out');
  if (output === true) {
    throw new Error('--out requires a directory path.');
  }
  const freshness = projectOptions(arguments_.flags).freshness;
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
  const result = await exportStaticSite({
    root: arguments_.root,
    output: resolve(
      arguments_.root,
      typeof output === 'string' ? output : '.shishan/site'
    ),
    webRoot,
    includeSource: arguments_.flags.has('include-source'),
    freshnessBase: freshness?.base ?? false,
    freshnessRequired: freshness?.required
  });
  await writeOutput(
    'Wrote static ShiShan site to ' +
      result.output +
      ' (' +
      result.files +
      ' files, ' +
      result.includedSources +
      ' sources included).'
  );
  if (!arguments_.flags.has('include-source')) {
    await writeOutput(
      'Source text was omitted. Use --include-source only when recipients may read the code.'
    );
  }
}

async function init(root: string): Promise<void> {
  const path = resolve(root, CONFIG_FILE);
  try {
    await writeFile(path, defaultConfigJson(), {
      encoding: 'utf8',
      flag: 'wx'
    });
    await writeOutput('Created ' + path);
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'EEXIST') {
      await writeOutput(path + ' already exists; left it unchanged.');
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
  const freshness = projectOptions(arguments_.flags).freshness;
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
  const server = await createShiShanServer({
    root: arguments_.root,
    host,
    port,
    webRoot,
    watch: true,
    freshnessBase: freshness?.base ?? false,
    freshnessRequired: freshness?.required
  });
  let address: string;
  try {
    address = await server.start();
  } catch (error) {
    await server.close();
    throw error;
  }
  await writeOutput('ShiShan is available at ' + address);
  await writeOutput(
    'Watching source files; updates are emitted as file-level patches.'
  );

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
      await scan(arguments_);
      break;
    case 'check':
      await check(arguments_);
      break;
    case 'export':
      await exportSnapshot(arguments_);
      break;
    case 'export-site':
      await exportSite(arguments_);
      break;
    case 'serve':
      await serve(arguments_);
      break;
    case 'help':
    case '--help':
    case '-h':
      await writeOutput(help());
      break;
    default:
      await writeError('Unknown command: ' + arguments_.command);
      await writeError(help());
      process.exitCode = 2;
  }
}

try {
  await main();
} catch (error: unknown) {
  await writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
