import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import micromatch from 'micromatch';
import {
  DEFAULT_CONFIG,
  PROTOCOL_VERSION,
  type ShiShanConfig
} from '@shishan/protocol';
import { languageForPath } from './language.js';

export const CONFIG_FILE = '.shishanrc.json';
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function cloneDefaultConfig(): ShiShanConfig {
  return {
    protocol: PROTOCOL_VERSION,
    include: [...DEFAULT_CONFIG.include],
    exclude: [...DEFAULT_CONFIG.exclude],
    server: { ...DEFAULT_CONFIG.server }
  };
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : fallback;
}

export async function loadConfig(root: string): Promise<ShiShanConfig> {
  const fallback = cloneDefaultConfig();
  try {
    const raw = JSON.parse(
      await readFile(join(root, CONFIG_FILE), 'utf8')
    ) as Partial<ShiShanConfig>;
    return {
      protocol: PROTOCOL_VERSION,
      include: stringArray(raw.include, fallback.include),
      exclude: stringArray(raw.exclude, fallback.exclude),
      server: {
        host:
          typeof raw.server?.host === 'string'
            ? raw.server.host
            : fallback.server.host,
        port:
          Number.isInteger(raw.server?.port) &&
          Number(raw.server?.port) > 0 &&
          Number(raw.server?.port) < 65_536
            ? Number(raw.server?.port)
            : fallback.server.port
      }
    };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'ENOENT') {
      return fallback;
    }
    throw new Error(
      'Could not read ' +
        CONFIG_FILE +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

export async function discoverSourcePaths(
  root: string,
  config: ShiShanConfig
): Promise<string[]> {
  const paths = await fg(config.include, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: config.exclude
  });

  const accepts = await createSourcePathFilter(root, config);
  return paths
    .filter(accepts)
    .sort((left, right) => left.localeCompare(right));
}

export function isSupportedSourcePath(path: string): boolean {
  if (!languageForPath(path) || path.endsWith('.d.ts')) {
    return false;
  }
  const parts = path.replaceAll('\\', '/').split('/');
  return !parts.some((part) =>
    ['.git', 'node_modules', 'dist', 'build', '.shishan'].includes(part)
  );
}

export async function createSourcePathFilter(
  root: string,
  config: ShiShanConfig
): Promise<(path: string) => boolean> {
  let gitignore: ReturnType<typeof ignore> | undefined;
  try {
    gitignore = ignore().add(await readFile(join(root, '.gitignore'), 'utf8'));
  } catch {
    gitignore = undefined;
  }

  return (path: string): boolean => {
    const normalized = path.replaceAll('\\', '/');
    return (
      isSupportedSourcePath(normalized) &&
      micromatch.isMatch(normalized, config.include, { dot: true }) &&
      !micromatch.isMatch(normalized, config.exclude, { dot: true }) &&
      !gitignore?.ignores(normalized)
    );
  };
}

export function defaultConfigJson(): string {
  return JSON.stringify(cloneDefaultConfig(), null, 2) + '\n';
}
