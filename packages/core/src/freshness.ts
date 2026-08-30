import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import type {
  Diagnostic,
  FileAnalysis,
  NarrativeDetail,
  NarrativeNode
} from '@shishan/protocol';
import { implementationFingerprint } from './analyzer.js';
import { ParserEngine } from './parser-engine.js';

const GIT_OUTPUT_LIMIT = 8 * 1024 * 1024;

interface GitResult {
  stdout: string;
  stderr: string;
}

function runGit(cwd: string, arguments_: readonly string[]): Promise<GitResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      [...arguments_],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: GIT_OUTPUT_LIMIT,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(
            new Error(
              'git ' +
                arguments_.join(' ') +
                ' failed: ' +
                (stderr.trim() || error.message)
            )
          );
          return;
        }
        resolvePromise({ stdout, stderr });
      }
    );
  });
}

function parseNullSeparated(value: string): string[] {
  return value
    .split('\0')
    .filter((path) => path.length > 0)
    .map((path) => path.split(sep).join('/'));
}

function isInside(parent: string, candidate: string): boolean {
  const local = relative(parent, candidate);
  return local === '' || (local !== '..' && !local.startsWith('..' + sep));
}

function stableFields(fields: NarrativeNode['fields']): object {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, [...values]])
  );
}

function projectDetail(detail: NarrativeDetail): object {
  return {
    localId: detail.localId,
    summary: detail.summary,
    fields: stableFields(detail.fields),
    coveredStatements: detail.coveredStatements
  };
}

function projectNarrative(node: NarrativeNode): object {
  return {
    localId: node.localId,
    kind: node.kind,
    summary: node.summary,
    fields: stableFields(node.fields),
    children: node.children.map(projectNarrative),
    details: node.details.map(projectDetail)
  };
}

export function narrativeFingerprint(node: NarrativeNode): string {
  return createHash('sha256')
    .update(JSON.stringify(projectNarrative(node)))
    .digest('hex');
}

// @shishan function compare-narrative-freshness
// @summary Detect narrated functions whose implementation changed without a narrative revision
// @input current file analysis and Git baseline analysis
// @output freshness diagnostics anchored to stale function narratives
export function compareNarrativeFreshness(
  current: FileAnalysis,
  baseline: FileAnalysis,
  baselineLabel: string
): Diagnostic[] {
  if (current.syntaxError || baseline.syntaxError) {
    return [];
  }

  const baselineFunctions = new Map(
    baseline.functions.map((node) => [node.localId, node])
  );
  const diagnostics: Diagnostic[] = [];
  // @shishan loop inspect-current-functions
  // @summary Compare every current narrated function with the same baseline narrative id
  // @condition current file still contains narrated functions to inspect
  for (const currentFunction of current.functions) {
    const baselineFunction = baselineFunctions.get(currentFunction.localId);
    if (!baselineFunction) {
      continue;
    }
    const currentImplementation = implementationFingerprint(
      current,
      currentFunction.localId
    );
    const baselineImplementation = implementationFingerprint(
      baseline,
      baselineFunction.localId
    );
    // @shishan branch skip-synchronized-function
    // @summary Skip functions that are unchanged, newly narrated, or updated together with their narrative
    if (
      !currentImplementation ||
      !baselineImplementation ||
      currentImplementation === baselineImplementation ||
      narrativeFingerprint(currentFunction) !==
        narrativeFingerprint(baselineFunction)
    ) {
      continue;
    }

    diagnostics.push({
      code: 'SHISHAN501',
      severity: 'warning',
      message:
        'Implementation of narrative ' +
        currentFunction.localId +
        ' changed from ' +
        baselineLabel +
        ', but its ShiShan narrative is unchanged.',
      path: current.path,
      range: currentFunction.annotationSource,
      annotationId: currentFunction.localId,
      suggestion:
        'Review the function narrative and update its summary, flow nodes, or details to match the implementation.'
    });
  }
  return diagnostics;
}

export interface GitFreshnessOptions {
  base?: string;
  required?: boolean;
}

export class GitFreshnessChecker {
  readonly root: string;
  readonly repositoryRoot: string;
  readonly base: string;
  readonly #revision: string;
  readonly #changedPaths = new Set<string>();
  readonly #baselineEngine = new ParserEngine();
  readonly #baselineAnalyses = new Map<string, FileAnalysis | null>();

  private constructor(
    root: string,
    repositoryRoot: string,
    base: string,
    revision: string
  ) {
    this.root = root;
    this.repositoryRoot = repositoryRoot;
    this.base = base;
    this.#revision = revision;
  }

  // @shishan function create-git-freshness-checker
  // @summary Pin a Git revision and preload the set of files changed from that baseline
  // @input project root, baseline revision, and required/optional Git policy
  // @output initialized checker or no checker when optional Git support is unavailable
  static async create(
    root: string,
    options: GitFreshnessOptions = {}
  ): Promise<GitFreshnessChecker | undefined> {
    const resolvedRoot = resolve(root);
    const base = options.base ?? 'HEAD';
    try {
      const repositoryRoot = resolve(
        (
          await runGit(resolvedRoot, ['rev-parse', '--show-toplevel'])
        ).stdout.trim()
      );
      if (!isInside(repositoryRoot, resolvedRoot)) {
        throw new Error('Project root is outside the Git repository.');
      }
      const revision = (
        await runGit(resolvedRoot, [
          'rev-parse',
          '--verify',
          base + '^{commit}'
        ])
      ).stdout.trim();
      const checker = new GitFreshnessChecker(
        resolvedRoot,
        repositoryRoot,
        base,
        revision
      );
      await checker.#replaceChangedPaths();
      return checker;
    } catch (error) {
      if (options.required) {
        throw new Error(
          'Could not initialize Git narrative freshness against ' +
            base +
            ': ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
      return undefined;
    }
  }

  async #diffPaths(paths: readonly string[]): Promise<string[]> {
    const arguments_ = [
      'diff',
      '--name-only',
      '-z',
      '--relative',
      this.#revision,
      '--'
    ];
    arguments_.push(...(paths.length > 0 ? paths : ['.']));
    return parseNullSeparated((await runGit(this.root, arguments_)).stdout);
  }

  async #replaceChangedPaths(): Promise<void> {
    this.#changedPaths.clear();
    for (const path of await this.#diffPaths([])) {
      this.#changedPaths.add(path);
    }
  }

  // @shishan function refresh-git-changed-paths
  // @summary Refresh freshness eligibility only for paths in the latest file-event batch
  // @input project-relative changed paths
  // @effect replaces changed-path membership without rescanning the project
  async refreshPaths(paths: readonly string[]): Promise<void> {
    const unique = [...new Set(paths)];
    for (const path of unique) {
      this.#changedPaths.delete(path);
    }
    if (unique.length === 0) {
      return;
    }
    for (const path of await this.#diffPaths(unique)) {
      this.#changedPaths.add(path);
    }
  }

  async #baseline(path: string, current: FileAnalysis): Promise<FileAnalysis | null> {
    if (this.#baselineAnalyses.has(path)) {
      return this.#baselineAnalyses.get(path) ?? null;
    }
    const repositoryPath = relative(
      this.repositoryRoot,
      resolve(this.root, path)
    )
      .split(sep)
      .join('/');
    try {
      const source = (
        await runGit(this.root, [
          'show',
          this.#revision + ':' + repositoryPath
        ])
      ).stdout;
      const analysis = this.#baselineEngine.analyze(
        path,
        current.language,
        source
      ).analysis;
      this.#baselineAnalyses.set(path, analysis);
      return analysis;
    } catch {
      this.#baselineAnalyses.set(path, null);
      return null;
    }
  }

  // @shishan function diagnose-git-freshness
  // @summary Compare one changed file with its cached Git baseline analysis
  // @input current project-relative path and file analysis
  // @output zero or more stale-narrative diagnostics
  async diagnostics(
    path: string,
    current: FileAnalysis
  ): Promise<Diagnostic[]> {
    if (!this.#changedPaths.has(path)) {
      return [];
    }
    const baseline = await this.#baseline(path, current);
    return baseline
      ? compareNarrativeFreshness(current, baseline, this.base)
      : [];
  }
}
