import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FileAnalysis,
  NarrativeNode,
  ProjectPatch,
  ProjectSnapshot,
  SourceRange
} from '@shishan/protocol';
import { NarrativeGraph } from './NarrativeGraph.js';
import { SourcePanel } from './SourcePanel.js';
import {
  applyProjectPatch,
  stateFromSnapshot,
  type ProjectState
} from './store.js';

interface Selection {
  path: string;
  narrativeId: string;
}

function firstSelection(files: Iterable<FileAnalysis>): Selection | undefined {
  for (const file of files) {
    const narrative = file.functions[0];
    if (narrative) {
      return { path: file.path, narrativeId: narrative.id };
    }
  }
  return undefined;
}

function findNarrative(
  state: ProjectState,
  selection?: Selection
): NarrativeNode | undefined {
  if (!selection) {
    return undefined;
  }
  return state.files
    .get(selection.path)
    ?.functions.find((item) => item.id === selection.narrativeId);
}

export default function App() {
  const [project, setProject] = useState<ProjectState>();
  const [selection, setSelection] = useState<Selection>();
  const [sourceRange, setSourceRange] = useState<SourceRange>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const projectRef = useRef<ProjectState | undefined>(undefined);
  const pendingPatchesRef = useRef<ProjectPatch[]>([]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    let disposed = false;
    const loadSnapshot = async (): Promise<void> => {
      try {
        const response = await fetch('/api/project');
        if (!response.ok) {
          throw new Error('Project request failed with ' + response.status + '.');
        }
        const snapshot = (await response.json()) as ProjectSnapshot;
        if (!disposed) {
          let next = stateFromSnapshot(snapshot);
          if (
            projectRef.current &&
            projectRef.current.generation > next.generation
          ) {
            next = projectRef.current;
          }
          for (const patch of pendingPatchesRef.current.sort(
            (left, right) => left.generation - right.generation
          )) {
            next = applyProjectPatch(next, patch);
          }
          pendingPatchesRef.current = [];
          projectRef.current = next;
          setProject(next);
          setError('');
        }
      } catch (reason) {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    };

    const events = new EventSource('/api/events');
    events.addEventListener('ready', (event) => {
      setConnected(true);
      const ready = JSON.parse((event as MessageEvent<string>).data) as {
        generation: number;
      };
      if (
        projectRef.current &&
        ready.generation > projectRef.current.generation
      ) {
        void loadSnapshot();
      }
    });
    events.addEventListener('patch', (event) => {
      const patch = JSON.parse(
        (event as MessageEvent<string>).data
      ) as ProjectPatch;
      const current = projectRef.current;
      if (!current) {
        pendingPatchesRef.current.push(patch);
        return;
      }
      const next = applyProjectPatch(current, patch);
      projectRef.current = next;
      setProject(next);
    });
    events.onerror = () => {
      setConnected(false);
    };
    void loadSnapshot();

    return () => {
      disposed = true;
      events.close();
    };
  }, []);

  const allFiles = useMemo(
    () =>
      project
        ? [...project.files.values()].sort((left, right) =>
            left.path.localeCompare(right.path)
          )
        : [],
    [project?.files]
  );
  const diagnostics = useMemo(
    () =>
      allFiles.flatMap((file) =>
        file.diagnostics.map((diagnostic) => ({ file, diagnostic }))
      ),
    [allFiles]
  );
  const files = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return allFiles;
    }
    return allFiles.filter(
      (file) =>
        file.path.toLowerCase().includes(query) ||
        file.language.toLowerCase().includes(query) ||
        file.functions.some(
          (item) =>
            item.name?.toLowerCase().includes(query) ||
            item.localId.toLowerCase().includes(query) ||
            item.summary.toLowerCase().includes(query)
        )
    );
  }, [allFiles, filter]);
  const displayedFiles = files.slice(0, 500);
  const narrative = project ? findNarrative(project, selection) : undefined;
  const selectedVersion =
    project && selection
      ? project.files.get(selection.path)?.contentHash
      : undefined;

  useEffect(() => {
    if (!project) {
      return;
    }
    const selected = findNarrative(project, selection);
    if (!selected) {
      const next = firstSelection(files);
      setSelection(next);
      setSourceRange(
        next ? findNarrative(project, next)?.source : undefined
      );
    }
  }, [files, project, selection]);

  useEffect(() => {
    if (narrative && selectedVersion) {
      setSourceRange(narrative.source);
    }
  }, [narrative?.id, selectedVersion]);

  const selectNarrative = useCallback(
    (path: string, item: NarrativeNode): void => {
      setSelection({ path, narrativeId: item.id });
      setSourceRange(item.source);
    },
    []
  );
  const selectSource = useCallback((range: SourceRange): void => {
    setSourceRange(range);
  }, []);

  if (!project) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">山</div>
        <h1>ShiShan</h1>
        <p>{error || 'Reading the local narrative index…'}</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">山</span>
          <div>
            <span className="eyebrow">Code narrative</span>
            <strong>{project.rootName}</strong>
          </div>
        </div>
        <div className="project-stats">
          <div>
            <span>Coverage</span>
            <strong>{project.coverage.percent}%</strong>
          </div>
          <div>
            <span>Functions</span>
            <strong>
              {project.coverage.narratedFunctions}/
              {project.coverage.totalFunctions}
            </strong>
          </div>
          <div>
            <span>Generation</span>
            <strong>{project.generation}</strong>
          </div>
          <div>
            <span>Diagnostics</span>
            <strong>{diagnostics.length}</strong>
          </div>
          <span
            className={connected ? 'connection live' : 'connection waiting'}
          >
            <i />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </header>

      <div className="workspace">
        <nav className="file-sidebar" aria-label="Narrated functions">
          <div className="sidebar-heading">
            <span className="eyebrow">Project map</span>
            <strong>{project.coverage.files} source files</strong>
            <label>
              <span className="visually-hidden">Filter files and functions</span>
              <input
                type="search"
                value={filter}
                placeholder="Filter files or functions"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          </div>
          <section className="quality-panel">
            <button
              className="quality-toggle"
              type="button"
              aria-expanded={diagnosticsOpen}
              onClick={() => setDiagnosticsOpen((value) => !value)}
            >
              <span>Diagnostics</span>
              <strong>{diagnostics.length}</strong>
            </button>
            {diagnosticsOpen ? (
              <div className="diagnostic-list">
                {diagnostics.length === 0 ? (
                  <p>No diagnostics in the current index.</p>
                ) : (
                  diagnostics.map(({ diagnostic }, index) => (
                    <button
                      type="button"
                      key={
                        diagnostic.code +
                        ':' +
                        diagnostic.path +
                        ':' +
                        index
                      }
                      onClick={() => {
                        if (diagnostic.range) {
                          setSourceRange(diagnostic.range);
                        }
                      }}
                    >
                      <span>
                        {diagnostic.severity} · {diagnostic.code}
                      </span>
                      <strong>{diagnostic.path}</strong>
                      <small>{diagnostic.message}</small>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </section>
          <div className="file-list">
            {displayedFiles.map((file) => (
              <section className="file-group" key={file.path}>
                <header>
                  <span className={'language-dot lang-' + file.language} />
                  <span title={file.path}>{file.path}</span>
                  {file.diagnostics.length > 0 ? (
                    <small>{file.diagnostics.length}</small>
                  ) : null}
                </header>
                {file.functions.length > 0 ? (
                  file.functions.map((item) => (
                    <button
                      className={
                        selection?.narrativeId === item.id
                          ? 'function-link active'
                          : 'function-link'
                      }
                      key={item.id}
                      type="button"
                      onClick={() => selectNarrative(file.path, item)}
                    >
                      <span>{item.name ?? item.localId}</span>
                      <small>{item.children.length} flows</small>
                    </button>
                  ))
                ) : (
                  <p className="no-functions">No narrated functions</p>
                )}
              </section>
            ))}
            {files.length === 0 ? (
              <p className="filter-empty">No files match “{filter}”.</p>
            ) : null}
            {files.length > displayedFiles.length ? (
              <p className="filter-empty">
                Showing the first {displayedFiles.length} files. Use the filter
                to narrow {files.length} matches.
              </p>
            ) : null}
          </div>
          <footer>
            <span>
              Last update{' '}
              {project.metrics.lastUpdate.parsedPaths.length > 0
                ? project.metrics.lastUpdate.parsedPaths.join(', ')
                : 'reused cached files'}
            </span>
            <strong>
              {project.metrics.lastUpdate.durationMs.toFixed(2)} ms
            </strong>
          </footer>
        </nav>

        <main className="narrative-workspace">
          {narrative ? (
            <>
              <div className="narrative-heading">
                <div>
                  <span className="eyebrow">
                    {selection?.path} · {narrative.localId}
                  </span>
                  <h1>{narrative.summary}</h1>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceRange(narrative.source)}
                >
                  View function source
                </button>
              </div>
              <NarrativeGraph
                narrative={narrative}
                onSelectSource={selectSource}
              />
            </>
          ) : (
            <div className="empty-state">
              <span>◇</span>
              <h1>No narrated functions yet</h1>
              <p>
                Add a <code>@shishan function</code> block and the live index
                will place it here.
              </p>
            </div>
          )}
        </main>

        <SourcePanel
          range={sourceRange}
          version={
            sourceRange
              ? project.files.get(sourceRange.path)?.contentHash
              : undefined
          }
        />
      </div>
    </div>
  );
}
