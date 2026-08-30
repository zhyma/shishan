import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, posix } from 'node:path';
import {
  validateProjectNarrativeManifest,
  type Diagnostic,
  type FileAnalysis,
  type ProjectNarrative,
  type ProjectNarrativeManifest,
  type ProjectNarrativeNode,
  type ProjectNarrativeSourceReference
} from '@shishan/protocol';

export const PROJECT_NARRATIVE_FILE = '.shishan/project.json';
export const MAX_PROJECT_NARRATIVE_BYTES = 256 * 1024;

export interface ProjectNarrativeLoadResult {
  narrative: ProjectNarrative | null;
  diagnostics: Diagnostic[];
}

function diagnostic(
  code: string,
  severity: Diagnostic['severity'],
  message: string,
  annotationId?: string,
  suggestion?: string
): Diagnostic {
  return {
    code,
    severity,
    message,
    path: PROJECT_NARRATIVE_FILE,
    ...(annotationId ? { annotationId } : {}),
    ...(suggestion ? { suggestion } : {})
  };
}

function safeProjectPath(input: string): string | undefined {
  const slashPath = input.replaceAll('\\', '/');
  if (isAbsolute(input) || /^[a-zA-Z]:\//.test(slashPath)) {
    return undefined;
  }
  const normalized = posix.normalize(slashPath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    return undefined;
  }
  return normalized;
}

function bindSource(
  reference: ProjectNarrativeSourceReference,
  nodeId: string,
  files: ReadonlyMap<string, FileAnalysis>,
  diagnostics: Diagnostic[]
): ProjectNarrativeNode['source'] | undefined {
  const path = safeProjectPath(reference.path);
  if (!path) {
    diagnostics.push(
      diagnostic(
        'SHISHAN604',
        'error',
        'Project narrative node "' +
          nodeId +
          '" uses an absolute or parent-traversing source path.',
        nodeId,
        'Use a project-relative source path.'
      )
    );
    return undefined;
  }
  const file = files.get(path);
  if (!file) {
    diagnostics.push(
      diagnostic(
        'SHISHAN604',
        'warning',
        'Project narrative node "' +
          nodeId +
          '" references an unindexed source: ' +
          path +
          '.',
        nodeId,
        'Check the path or include the file in .shishanrc.json.'
      )
    );
    return { path, ...(reference.symbol ? { symbol: reference.symbol } : {}) };
  }
  if (!reference.symbol) {
    return { path };
  }
  const matches = file.symbols.filter((symbol) => symbol.name === reference.symbol);
  if (matches.length === 0) {
    diagnostics.push(
      diagnostic(
        'SHISHAN605',
        'warning',
        'Project narrative node "' +
          nodeId +
          '" could not bind symbol "' +
          reference.symbol +
          '" in ' +
          path +
          '.',
        nodeId,
        'Update the symbol after the corresponding refactor.'
      )
    );
    return { path, symbol: reference.symbol };
  }
  if (matches.length > 1) {
    diagnostics.push(
      diagnostic(
        'SHISHAN606',
        'warning',
        'Project narrative node "' +
          nodeId +
          '" matches more than one symbol named "' +
          reference.symbol +
          '" in ' +
          path +
          '.',
        nodeId,
        'Reference a symbol name that is unique within the file.'
      )
    );
  }
  const symbol = matches[0];
  if (!symbol) {
    return { path, symbol: reference.symbol };
  }
  return {
    path,
    symbol: reference.symbol,
    range: symbol.source,
    ...(symbol.narrativeId ? { narrativeId: symbol.narrativeId } : {})
  };
}

function resolveManifest(
  manifest: ProjectNarrativeManifest,
  files: ReadonlyMap<string, FileAnalysis>
): ProjectNarrativeLoadResult {
  const diagnostics: Diagnostic[] = [];
  const flowIds = new Set<string>();
  let topologyInvalid = false;

  for (const flow of manifest.flows) {
    if (flowIds.has(flow.id)) {
      topologyInvalid = true;
      diagnostics.push(
        diagnostic(
          'SHISHAN603',
          'error',
          'Project narrative flow ID is duplicated: ' + flow.id + '.',
          flow.id
        )
      );
    }
    flowIds.add(flow.id);
  }
  if (!flowIds.has(manifest.entryFlow)) {
    topologyInvalid = true;
    diagnostics.push(
      diagnostic(
        'SHISHAN603',
        'error',
        'entryFlow does not name an existing flow: ' + manifest.entryFlow + '.',
        manifest.entryFlow
      )
    );
  }

  const flows = manifest.flows.map((flow) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const node of flow.nodes) {
      if (nodeIds.has(node.id)) {
        topologyInvalid = true;
        diagnostics.push(
          diagnostic(
            'SHISHAN603',
            'error',
            'Flow "' + flow.id + '" duplicates node ID "' + node.id + '".',
            node.id
          )
        );
      }
      nodeIds.add(node.id);
    }
    for (const edge of flow.edges) {
      if (edgeIds.has(edge.id)) {
        topologyInvalid = true;
        diagnostics.push(
          diagnostic(
            'SHISHAN603',
            'error',
            'Flow "' + flow.id + '" duplicates edge ID "' + edge.id + '".',
            edge.id
          )
        );
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        topologyInvalid = true;
        diagnostics.push(
          diagnostic(
            'SHISHAN603',
            'error',
            'Flow "' +
              flow.id +
              '" edge "' +
              edge.id +
              '" references a missing node.',
            edge.id
          )
        );
      }
    }
    return {
      ...flow,
      nodes: flow.nodes.map((node) => {
        const source = node.source
          ? bindSource(node.source, node.id, files, diagnostics)
          : undefined;
        return {
          ...node,
          ...(source ? { source } : {})
        };
      })
    };
  });

  return {
    narrative: topologyInvalid ? null : { ...manifest, flows },
    diagnostics
  };
}

// @shishan function load-project-narrative
// @summary Read and bind the bounded project-level narrative manifest
// @input project root and current AST-backed file analyses
// @output resolved project flows plus explicit manifest diagnostics
export async function loadProjectNarrative(
  root: string,
  files: ReadonlyMap<string, FileAnalysis>
): Promise<ProjectNarrativeLoadResult> {
  const path = join(root, PROJECT_NARRATIVE_FILE);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'ENOENT') {
      return { narrative: null, diagnostics: [] };
    }
    return {
      narrative: null,
      diagnostics: [
        diagnostic(
          'SHISHAN601',
          'error',
          'Project narrative manifest could not be inspected: ' +
            (error instanceof Error ? error.message : String(error))
        )
      ]
    };
  }

  // @shishan branch reject-unsafe-manifest
  // @summary Refuse symbolic links, non-files, and oversized project manifests
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > MAX_PROJECT_NARRATIVE_BYTES
  ) {
    return {
      narrative: null,
      diagnostics: [
        diagnostic(
          'SHISHAN601',
          'error',
          'Project narrative manifest must be a regular file no larger than ' +
            MAX_PROJECT_NARRATIVE_BYTES +
            ' bytes.'
        )
      ]
    };
  }

  let value: unknown;
  // @shishan error parse-project-manifest
  // @summary Parse the project manifest as inert JSON
  // @failure invalid JSON is reported without evaluating any content
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    return {
      narrative: null,
      diagnostics: [
        diagnostic(
          'SHISHAN601',
          'error',
          'Project narrative manifest is not valid JSON: ' +
            (error instanceof Error ? error.message : String(error))
        )
      ]
    };
  }

  const validation = validateProjectNarrativeManifest(value);
  // @shishan branch validate-project-manifest
  // @summary Reject fields and graph sizes outside the versioned manifest schema
  if (!validation.valid) {
    return {
      narrative: null,
      diagnostics: [
        diagnostic(
          'SHISHAN602',
          'error',
          'Project narrative manifest does not match the schema: ' +
            validation.errors.slice(0, 5).join('; ')
        )
      ]
    };
  }

  // @shishan step resolve-project-bindings
  // @summary Validate graph topology and bind declared source symbols to AST ranges
  return resolveManifest(value as ProjectNarrativeManifest, files);
}
