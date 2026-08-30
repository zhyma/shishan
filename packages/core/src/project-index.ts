import { basename, relative, resolve, sep } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import {
  PROTOCOL_VERSION,
  type FileAnalysis,
  type IndexMetrics,
  type ProjectCoverage,
  type ProjectPatch,
  type ProjectSnapshot,
  type ShiShanConfig,
  type UpdateMetrics
} from '@shishan/protocol';
import {
  MAX_SOURCE_BYTES,
  createSourcePathFilter,
  discoverSourcePaths,
  loadConfig
} from './config.js';
import { languageForPath } from './language.js';
import { ParserEngine } from './parser-engine.js';

interface CoverageAccumulator {
  files: number;
  filesWithNarratives: number;
  totalFunctions: number;
  narratedFunctions: number;
  flowNodes: number;
  details: number;
}

const EMPTY_UPDATE: UpdateMetrics = {
  requestedPaths: [],
  parsedPaths: [],
  removedPaths: [],
  unchangedPaths: [],
  reusedFileCount: 0,
  durationMs: 0
};

function normalizeRelative(root: string, input: string): string | undefined {
  const absolute = resolve(root, input);
  const path = relative(root, absolute);
  if (!path || path === '..' || path.startsWith('..' + sep)) {
    return undefined;
  }
  return path.split(sep).join('/');
}

function makeMetrics(): IndexMetrics {
  return {
    totalParseOperations: 0,
    fullParses: 0,
    incrementalParses: 0,
    skippedUnchangedFiles: 0,
    lastUpdate: { ...EMPTY_UPDATE }
  };
}

function oversizeAnalysis(
  path: string,
  size: number,
  modified: number
): FileAnalysis | undefined {
  const language = languageForPath(path);
  if (!language) {
    return undefined;
  }
  return {
    path,
    language,
    contentHash: 'resource-limit:' + size + ':' + modified,
    functions: [],
    symbols: [],
    diagnostics: [
      {
        code: 'SHISHAN002',
        severity: 'warning',
        message:
          'File is ' +
          size +
          ' bytes, above the ' +
          MAX_SOURCE_BYTES +
          '-byte parser safety limit.',
        path,
        suggestion: 'Split the file or raise the limit in a future explicit policy.'
      }
    ],
    coverage: {
      totalFunctions: 0,
      narratedFunctions: 0,
      percent: 100,
      flowNodes: 0,
      details: 0
    },
    parseMode: 'full',
    syntaxError: false
  };
}

function failedAnalysis(
  path: string,
  key: string,
  error: unknown
): FileAnalysis | undefined {
  const language = languageForPath(path);
  if (!language) {
    return undefined;
  }
  return {
    path,
    language,
    contentHash: 'analysis-failure:' + key,
    functions: [],
    symbols: [],
    diagnostics: [
      {
        code: 'SHISHAN003',
        severity: 'error',
        message:
          'File could not be read or parsed: ' +
          (error instanceof Error ? error.message : String(error)),
        path,
        suggestion: 'Check file permissions and retry the scan.'
      }
    ],
    coverage: {
      totalFunctions: 0,
      narratedFunctions: 0,
      percent: 100,
      flowNodes: 0,
      details: 0
    },
    parseMode: 'full',
    syntaxError: false
  };
}

export class ProjectIndex {
  readonly root: string;
  readonly config: ShiShanConfig;
  readonly #engine = new ParserEngine();
  readonly #pathFilter: (path: string) => boolean;
  readonly #files = new Map<string, FileAnalysis>();
  readonly #coverage: CoverageAccumulator = {
    files: 0,
    filesWithNarratives: 0,
    totalFunctions: 0,
    narratedFunctions: 0,
    flowNodes: 0,
    details: 0
  };
  readonly #metrics = makeMetrics();
  #generation = 0;

  private constructor(
    root: string,
    config: ShiShanConfig,
    pathFilter: (path: string) => boolean
  ) {
    this.root = resolve(root);
    this.config = config;
    this.#pathFilter = pathFilter;
  }

  static async create(root: string): Promise<ProjectIndex> {
    const resolved = resolve(root);
    const config = await loadConfig(resolved);
    return new ProjectIndex(
      resolved,
      config,
      await createSourcePathFilter(resolved, config)
    );
  }

  async initialize(): Promise<ProjectSnapshot> {
    const paths = await discoverSourcePaths(this.root, this.config);
    await this.updatePaths(paths);
    return this.snapshot();
  }

  #applyCoverage(
    analysis: FileAnalysis,
    direction: 1 | -1
  ): void {
    this.#coverage.files += direction;
    this.#coverage.filesWithNarratives +=
      analysis.coverage.narratedFunctions > 0 ? direction : 0;
    this.#coverage.totalFunctions +=
      direction * analysis.coverage.totalFunctions;
    this.#coverage.narratedFunctions +=
      direction * analysis.coverage.narratedFunctions;
    this.#coverage.flowNodes += direction * analysis.coverage.flowNodes;
    this.#coverage.details += direction * analysis.coverage.details;
  }

  #setFile(path: string, analysis: FileAnalysis): void {
    const previous = this.#files.get(path);
    if (previous) {
      this.#applyCoverage(previous, -1);
    }
    this.#files.set(path, analysis);
    this.#applyCoverage(analysis, 1);
  }

  #removeFile(path: string): boolean {
    const previous = this.#files.get(path);
    if (!previous) {
      return false;
    }
    this.#applyCoverage(previous, -1);
    this.#files.delete(path);
    this.#engine.remove(path);
    return true;
  }

  coverage(): ProjectCoverage {
    const total = this.#coverage.totalFunctions;
    return {
      ...this.#coverage,
      percent:
        total === 0
          ? 100
          : Math.round((this.#coverage.narratedFunctions / total) * 10_000) /
            100
    };
  }

  metrics(): IndexMetrics {
    return {
      ...this.#metrics,
      lastUpdate: {
        ...this.#metrics.lastUpdate,
        requestedPaths: [...this.#metrics.lastUpdate.requestedPaths],
        parsedPaths: [...this.#metrics.lastUpdate.parsedPaths],
        removedPaths: [...this.#metrics.lastUpdate.removedPaths],
        unchangedPaths: [...this.#metrics.lastUpdate.unchangedPaths]
      }
    };
  }

  snapshot(): ProjectSnapshot {
    return {
      protocolVersion: PROTOCOL_VERSION,
      generation: this.#generation,
      rootName: basename(this.root),
      files: [...this.#files.values()].sort((left, right) =>
        left.path.localeCompare(right.path)
      ),
      coverage: this.coverage(),
      metrics: this.metrics()
    };
  }

  file(path: string): FileAnalysis | undefined {
    const normalized = normalizeRelative(this.root, path);
    return normalized ? this.#files.get(normalized) : undefined;
  }

  sourcePath(path: string): string | undefined {
    const normalized = normalizeRelative(this.root, path);
    if (!normalized || !this.#files.has(normalized)) {
      return undefined;
    }
    return resolve(this.root, normalized);
  }

  acceptsSourcePath(path: string): boolean {
    const normalized = normalizeRelative(this.root, path);
    return Boolean(normalized && this.#pathFilter(normalized));
  }

  async updatePaths(inputs: readonly string[]): Promise<ProjectPatch> {
    const started = performance.now();
    const requestedPaths = [
      ...new Set(
        inputs
          .map((input) => normalizeRelative(this.root, input))
          .filter((path): path is string => Boolean(path))
      )
    ].filter(this.#pathFilter);
    const parsedPaths: string[] = [];
    const removedPaths: string[] = [];
    const unchangedPaths: string[] = [];
    const upsertFiles: FileAnalysis[] = [];

    for (const path of requestedPaths) {
      const absolute = resolve(this.root, path);
      let metadata;
      try {
        metadata = await lstat(absolute);
      } catch (error) {
        const code =
          typeof error === 'object' && error && 'code' in error
            ? String(error.code)
            : '';
        if (code === 'ENOENT') {
          if (this.#removeFile(path)) {
            removedPaths.push(path);
          }
          continue;
        }
        const analysis = failedAnalysis(path, code || 'stat', error);
        if (analysis) {
          const previous = this.#files.get(path);
          if (previous?.contentHash === analysis.contentHash) {
            unchangedPaths.push(path);
          } else {
            this.#engine.remove(path);
            this.#setFile(path, analysis);
            upsertFiles.push(analysis);
          }
        }
        continue;
      }

      if (!metadata.isFile()) {
        if (this.#removeFile(path)) {
          removedPaths.push(path);
        }
        continue;
      }

      if (metadata.size > MAX_SOURCE_BYTES) {
        const analysis = oversizeAnalysis(
          path,
          metadata.size,
          metadata.mtimeMs
        );
        if (!analysis) {
          continue;
        }
        const previous = this.#files.get(path);
        if (previous?.contentHash === analysis.contentHash) {
          unchangedPaths.push(path);
          continue;
        }
        this.#engine.remove(path);
        this.#setFile(path, analysis);
        upsertFiles.push(analysis);
        continue;
      }

      const language = languageForPath(path);
      if (!language) {
        continue;
      }
      let result;
      try {
        const content = await readFile(absolute, 'utf8');
        result = this.#engine.analyze(path, language, content);
      } catch (error) {
        const analysis = failedAnalysis(
          path,
          metadata.size + ':' + metadata.mtimeMs,
          error
        );
        if (analysis) {
          const previous = this.#files.get(path);
          if (previous?.contentHash === analysis.contentHash) {
            unchangedPaths.push(path);
          } else {
            this.#engine.remove(path);
            this.#setFile(path, analysis);
            upsertFiles.push(analysis);
          }
        }
        continue;
      }
      if (!result.parsed) {
        unchangedPaths.push(path);
        this.#metrics.skippedUnchangedFiles += 1;
        continue;
      }

      this.#setFile(path, result.analysis);
      upsertFiles.push(result.analysis);
      parsedPaths.push(path);
      this.#metrics.totalParseOperations += 1;
      if (result.incremental) {
        this.#metrics.incrementalParses += 1;
      } else {
        this.#metrics.fullParses += 1;
      }
    }

    if (upsertFiles.length > 0 || removedPaths.length > 0) {
      this.#generation += 1;
    }
    const lastUpdate: UpdateMetrics = {
      requestedPaths,
      parsedPaths,
      removedPaths,
      unchangedPaths,
      reusedFileCount: Math.max(
        0,
        this.#files.size - upsertFiles.length
      ),
      durationMs: Math.round((performance.now() - started) * 100) / 100
    };
    this.#metrics.lastUpdate = lastUpdate;

    return {
      protocolVersion: PROTOCOL_VERSION,
      generation: this.#generation,
      upsertFiles,
      removedFiles: removedPaths,
      coverage: this.coverage(),
      metrics: this.metrics()
    };
  }
}
