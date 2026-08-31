import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ProjectIndex } from '@shishan/core';
import {
  assertProtocolPayload,
  type ProjectSnapshot
} from '@shishan/protocol';

export const MAX_STATIC_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_STATIC_PAYLOAD_BYTES = 64 * 1024 * 1024;

export interface StaticExportOptions {
  root: string;
  output: string;
  webRoot: string;
  includeSource?: boolean;
  freshnessBase?: string | false;
  freshnessRequired?: boolean;
}

export interface StaticExportResult {
  output: string;
  files: number;
  includedSources: number;
  sourceBytes: number;
  payloadBytes: number;
}

interface StaticPayload {
  snapshot: ProjectSnapshot;
  sources?: Record<string, string>;
  generatedAt: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function serializePayload(payload: StaticPayload): string {
  return (
    'globalThis.__SHISHAN_STATIC__ = ' +
    JSON.stringify(payload)
      .replaceAll('\u2028', '\\u2028')
      .replaceAll('\u2029', '\\u2029') +
    ';\n'
  );
}

function injectStaticDataScript(html: string): string {
  const moduleScript = '<script type="module"';
  const index = html.indexOf(moduleScript);
  if (index < 0) {
    throw new Error('Web build index.html has no module entry script.');
  }
  return (
    html.slice(0, index) +
    '<script src="./shishan-data.js"></script>\n    ' +
    html.slice(index)
  );
}

async function collectSources(
  index: ProjectIndex,
  snapshot: ProjectSnapshot
): Promise<{ sources: Record<string, string>; bytes: number }> {
  const sources: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  let bytes = 0;
  for (const file of snapshot.files) {
    const sourcePath = index.sourcePath(file.path);
    if (!sourcePath) {
      continue;
    }
    const metadata = await lstat(sourcePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      continue;
    }
    const source = await readFile(sourcePath, 'utf8');
    bytes += Buffer.byteLength(source);
    if (bytes > MAX_STATIC_SOURCE_BYTES) {
      throw new Error(
        'Static source payload exceeds the ' +
          MAX_STATIC_SOURCE_BYTES +
          '-byte safety limit. Export without --include-source.'
      );
    }
    sources[file.path] = source;
  }
  return { sources, bytes };
}

// @shishan function export-static-site
// @summary Build an immutable Web export from one project snapshot
// @input project root, built Web assets, output directory, and source-disclosure policy
// @output export location and bounded payload metrics
// @effect writes a new directory without replacing an existing target
export async function exportStaticSite(
  options: StaticExportOptions
): Promise<StaticExportResult> {
  const root = resolve(options.root);
  const output = resolve(options.output);
  const webRoot = resolve(options.webRoot);
  if (!(await stat(webRoot)).isDirectory()) {
    throw new Error('Web build directory does not exist: ' + webRoot);
  }
  if (await pathExists(output)) {
    throw new Error(
      'Static export target already exists; choose a new directory: ' + output
    );
  }

  // @shishan step build-export-snapshot
  // @summary Build one schema-valid project snapshot with optional Git freshness diagnostics
  const index = await ProjectIndex.create(
    root,
    options.freshnessBase === false
      ? {}
      : {
          freshness: {
            base: options.freshnessBase ?? 'HEAD',
            required: options.freshnessRequired ?? false
          }
        }
  );
  const snapshot = await index.initialize();
  assertProtocolPayload(snapshot);
  // @shishan step apply-source-disclosure
  // @summary Include bounded indexed source only after the caller explicitly opts in
  const collected = options.includeSource
    ? await collectSources(index, snapshot)
    : { sources: undefined, bytes: 0 };
  const payload: StaticPayload = {
    snapshot,
    ...(collected.sources ? { sources: collected.sources } : {}),
    generatedAt: new Date().toISOString()
  };
  const dataScript = serializePayload(payload);
  const payloadBytes = Buffer.byteLength(dataScript);
  if (payloadBytes > MAX_STATIC_PAYLOAD_BYTES) {
    throw new Error(
      'Static data payload exceeds the ' +
        MAX_STATIC_PAYLOAD_BYTES +
        '-byte safety limit. Narrow the project include patterns.'
    );
  }

  // @shishan detail prepare-atomic-output
  // @summary Prepare a sibling temporary directory so incomplete exports never appear at the target path
  // @covers statements=2
  await mkdir(dirname(output), { recursive: true });
  const temporary = await mkdtemp(join(dirname(output), '.shishan-site-'));
  // @shishan branch publish-complete-export
  // @summary Assemble all assets before atomically publishing the finished directory
  try {
    await cp(webRoot, temporary, { recursive: true });
    const indexPath = join(temporary, 'index.html');
    await writeFile(
      indexPath,
      injectStaticDataScript(await readFile(indexPath, 'utf8')),
      'utf8'
    );
    await writeFile(
      join(temporary, 'shishan-data.js'),
      dataScript,
      'utf8'
    );
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  return {
    output,
    files: snapshot.files.length,
    includedSources: collected.sources
      ? Object.keys(collected.sources).length
      : 0,
    sourceBytes: collected.bytes,
    payloadBytes
  };
}
