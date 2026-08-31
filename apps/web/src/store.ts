import type {
  FileAnalysis,
  Diagnostic,
  IndexMetrics,
  ProjectCoverage,
  ProjectNarrative,
  ProjectPatch,
  ProjectSnapshot
} from '@shishan/protocol';

export interface ProjectState {
  rootName: string;
  generation: number;
  projectNarrative: ProjectNarrative | null;
  projectDiagnostics: readonly Diagnostic[];
  files: ReadonlyMap<string, FileAnalysis>;
  coverage: ProjectCoverage;
  metrics: IndexMetrics;
}

export function stateFromSnapshot(snapshot: ProjectSnapshot): ProjectState {
  return {
    rootName: snapshot.rootName,
    generation: snapshot.generation,
    projectNarrative: snapshot.projectNarrative,
    projectDiagnostics: snapshot.projectDiagnostics,
    files: new Map(snapshot.files.map((file) => [file.path, file])),
    coverage: snapshot.coverage,
    metrics: snapshot.metrics
  };
}

export function applyProjectPatch(
  state: ProjectState,
  patch: ProjectPatch
): ProjectState {
  if (patch.generation <= state.generation) {
    return state;
  }
  const files = new Map(state.files);
  for (const path of patch.removedFiles) {
    files.delete(path);
  }
  for (const file of patch.upsertFiles) {
    files.set(file.path, file);
  }
  return {
    ...state,
    generation: patch.generation,
    projectNarrative: patch.projectNarrativeChanged
      ? (patch.projectNarrative ?? null)
      : state.projectNarrative,
    projectDiagnostics: patch.projectNarrativeChanged
      ? (patch.projectDiagnostics ?? [])
      : state.projectDiagnostics,
    files,
    coverage: patch.coverage,
    metrics: patch.metrics
  };
}
