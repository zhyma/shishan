import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Diagnostic,
  FileAnalysis,
  NarrativeNode,
  ProjectNarrativeNode,
  ProjectPatch,
  ProjectSnapshot,
  SourceRange
} from '@shishan/protocol';
import { NarrativeGraph } from './NarrativeGraph.js';
import { ProjectNarrativeGraph } from './ProjectNarrativeGraph.js';
import { SourcePanel } from './SourcePanel.js';
import { narrativeNodeLabel } from './graph-layout.js';
import { readStaticData } from './static-data.js';
import {
  applyProjectPatch,
  stateFromSnapshot,
  type ProjectState
} from './store.js';
import { updatePathSummary } from './update-summary.js';

interface Selection {
  path: string;
  narrativeId: string;
}

interface DiagnosticEntry {
  file?: FileAnalysis;
  diagnostic: Diagnostic;
}

type WorkspaceView = 'overview' | 'functions';

const STATIC_DATA = readStaticData();

function initialView(): WorkspaceView {
  return new URLSearchParams(window.location.search).get('view') === 'functions'
    ? 'functions'
    : 'overview';
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
  const [project, setProject] = useState<ProjectState | undefined>(() =>
    STATIC_DATA ? stateFromSnapshot(STATIC_DATA.snapshot) : undefined
  );
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [flowId, setFlowId] = useState('');
  const [selection, setSelection] = useState<Selection>();
  const [sourceRange, setSourceRange] = useState<SourceRange>();
  const [connected, setConnected] = useState(Boolean(STATIC_DATA));
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const projectRef = useRef<ProjectState | undefined>(project);
  const pendingPatchesRef = useRef<ProjectPatch[]>([]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (STATIC_DATA) {
      return;
    }
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
  const narratedFiles = useMemo(
    () => allFiles.filter((file) => file.functions.length > 0),
    [allFiles]
  );
  const diagnostics = useMemo<DiagnosticEntry[]>(
    () =>
      [
        ...(project?.projectDiagnostics.map((diagnostic) => ({ diagnostic })) ??
          []),
        ...allFiles.flatMap((file) =>
          file.diagnostics.map((diagnostic) => ({ file, diagnostic }))
        )
      ].filter(({ diagnostic }) => diagnostic.severity !== 'info'),
    [allFiles, project?.projectDiagnostics]
  );
  const staleDiagnostics = useMemo(
    () =>
      diagnostics.filter(
        ({ diagnostic }) => diagnostic.code === 'SHISHAN501'
      ),
    [diagnostics]
  );
  const files = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return narratedFiles;
    }
    return narratedFiles.filter(
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
  }, [filter, narratedFiles]);
  const displayedFiles = files.slice(0, 500);
  const narrative = project ? findNarrative(project, selection) : undefined;
  const selectedVersion =
    project && selection
      ? project.files.get(selection.path)?.contentHash
      : undefined;
  const projectFlows = project?.projectNarrative?.flows ?? [];
  const activeFlow = useMemo(() => {
    const story = project?.projectNarrative;
    if (!story) {
      return undefined;
    }
    return (
      story.flows.find((flow) => flow.id === flowId) ??
      story.flows.find((flow) => flow.id === story.entryFlow) ??
      story.flows[0]
    );
  }, [flowId, project?.projectNarrative]);

  useEffect(() => {
    const story = project?.projectNarrative;
    if (!story) {
      setFlowId('');
      return;
    }
    if (!story.flows.some((flow) => flow.id === flowId)) {
      setFlowId(story.entryFlow);
    }
  }, [flowId, project?.projectNarrative]);

  useEffect(() => {
    if (!project || view !== 'functions') {
      return;
    }
    const selected = findNarrative(project, selection);
    if (!selected) {
      const next = firstSelection(files);
      setSelection(next);
      setSourceRange(next ? findNarrative(project, next)?.source : undefined);
    }
  }, [files, project, selection, view]);

  useEffect(() => {
    if (view === 'functions' && narrative && selectedVersion) {
      setSourceRange(narrative.source);
    }
  }, [narrative?.id, selectedVersion, view]);

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
  const selectProjectSource = useCallback((node: ProjectNarrativeNode): void => {
    if (node.source?.range) {
      setSourceRange(node.source.range);
    }
  }, []);
  const openProjectFunction = useCallback(
    (node: ProjectNarrativeNode): void => {
      const source = node.source;
      if (!source?.narrativeId || !project) {
        return;
      }
      const target = project.files
        .get(source.path)
        ?.functions.find((item) => item.id === source.narrativeId);
      if (!target) {
        return;
      }
      setView('functions');
      selectNarrative(source.path, target);
    },
    [project, selectNarrative]
  );

  const openDiagnostic = useCallback(
    ({ file, diagnostic }: DiagnosticEntry): void => {
      if (file) {
        const target = diagnostic.annotationId
          ? file.functions.find(
              (item) => item.localId === diagnostic.annotationId
            )
          : undefined;
        if (target) {
          setView('functions');
          selectNarrative(file.path, target);
        }
      } else if (diagnostic.annotationId && project?.projectNarrative) {
        const targetFlow = project.projectNarrative.flows.find((flow) =>
          flow.nodes.some((node) => node.id === diagnostic.annotationId)
        );
        if (targetFlow) {
          setView('overview');
          setFlowId(targetFlow.id);
        }
      }
      if (diagnostic.range) {
        setSourceRange(diagnostic.range);
      }
    },
    [project?.projectNarrative, selectNarrative]
  );

  if (!project) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">山</div>
        <h1>ShiShan</h1>
        <p>{error || 'Reading the local narrative index…'}</p>
      </main>
    );
  }

  const showSource = view === 'functions' || Boolean(sourceRange);

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
        <div
          className="mobile-view-switcher"
          role="tablist"
          aria-label="Narrative level"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'overview'}
            className={view === 'overview' ? 'active' : ''}
            onClick={() => setView('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'functions'}
            className={view === 'functions' ? 'active' : ''}
            onClick={() => setView('functions')}
          >
            Functions
          </button>
        </div>
        <div className="project-stats">
          <div>
            <span>Project flows</span>
            <strong>{project.projectNarrative?.flows.length ?? 0}</strong>
          </div>
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
            <span>Diagnostics</span>
            <strong>{diagnostics.length}</strong>
          </div>
          <div>
            <span>Freshness</span>
            <strong>{staleDiagnostics.length} stale</strong>
          </div>
          <span
            className={
              STATIC_DATA
                ? 'connection static'
                : connected
                  ? 'connection live'
                  : 'connection waiting'
            }
          >
            <i />
            {STATIC_DATA ? 'Static' : connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </header>

      <div
        className={
          'workspace workspace-' +
          view +
          (showSource ? ' source-open' : ' source-closed')
        }
      >
        <nav className="file-sidebar" aria-label="Code narrative navigation">
          <div className="sidebar-heading">
            <span className="eyebrow">Explore</span>
            <strong>
              {view === 'overview'
                ? 'Overall narrative'
                : narratedFiles.length + ' narrated files'}
            </strong>
            <div className="view-switcher" role="tablist" aria-label="Narrative level">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'overview'}
                className={view === 'overview' ? 'active' : ''}
                onClick={() => setView('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'functions'}
                className={view === 'functions' ? 'active' : ''}
                onClick={() => setView('functions')}
              >
                Functions
              </button>
            </div>
            {view === 'functions' ? (
              <label>
                <span className="visually-hidden">Filter files and functions</span>
                <input
                  type="search"
                  value={filter}
                  placeholder="Filter files or functions"
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
            ) : null}
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
                  diagnostics.map((entry, index) => (
                    <button
                      type="button"
                      key={
                        entry.diagnostic.code +
                        ':' +
                        entry.diagnostic.path +
                        ':' +
                        index
                      }
                      onClick={() => openDiagnostic(entry)}
                    >
                      <span>
                        {entry.diagnostic.severity} · {entry.diagnostic.code}
                      </span>
                      <strong>{entry.diagnostic.path}</strong>
                      <small>{entry.diagnostic.message}</small>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </section>

          {view === 'overview' ? (
            <div className="flow-sidebar">
              {project.projectNarrative ? (
                <>
                  <section className="project-intro">
                    <span className="eyebrow">Project story</span>
                    <h2>{project.projectNarrative.title}</h2>
                    <p>{project.projectNarrative.summary}</p>
                  </section>
                  <section className="flow-list" aria-label="Project flows">
                    <span className="eyebrow">Named flows</span>
                    {project.projectNarrative.flows.map((flow) => (
                      <button
                        type="button"
                        key={flow.id}
                        className={activeFlow?.id === flow.id ? 'active' : ''}
                        onClick={() => {
                          setFlowId(flow.id);
                          setSourceRange(undefined);
                        }}
                      >
                        <strong>{flow.title}</strong>
                        <span>{flow.nodes.length} nodes</span>
                        <small>{flow.summary}</small>
                      </button>
                    ))}
                  </section>
                </>
              ) : (
                <section className="project-intro manifest-missing">
                  <span className="eyebrow">Manifest missing</span>
                  <h2>No overall story yet</h2>
                  <p>
                    Add <code>.shishan/project.json</code> to name the project’s
                    important flows. The function index remains available in
                    the Functions tab.
                  </p>
                </section>
              )}
            </div>
          ) : (
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
                        <small>
                          {file.diagnostics.some(
                            (diagnostic) =>
                              diagnostic.code === 'SHISHAN501' &&
                              diagnostic.annotationId === item.localId
                          )
                            ? 'stale · '
                            : ''}
                          {narrativeNodeLabel(item)}
                        </small>
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
          )}
          <footer>
            <span>
              Last update{' '}
              {updatePathSummary(
                project.metrics.lastUpdate.parsedPaths,
                project.generation
              )}
            </span>
            <strong>
              {project.metrics.lastUpdate.durationMs.toFixed(2)} ms
            </strong>
          </footer>
        </nav>

        <main className="narrative-workspace">
          {view === 'overview' ? (
            activeFlow ? (
              <>
                <div className="narrative-heading project-flow-heading">
                  <div>
                    <span className="eyebrow">
                      Overall narrative · {activeFlow.id}
                    </span>
                    <h1>{activeFlow.title}</h1>
                    <p>{activeFlow.summary}</p>
                  </div>
                  <div className="flow-heading-meta">
                    {projectFlows.length > 1 ? (
                      <select
                        className="mobile-flow-select"
                        aria-label="Choose project flow"
                        value={activeFlow.id}
                        onChange={(event) => {
                          setFlowId(event.target.value);
                          setSourceRange(undefined);
                        }}
                      >
                        {projectFlows.map((flow) => (
                          <option key={flow.id} value={flow.id}>
                            {flow.title}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <span>{activeFlow.nodes.length} narrative nodes</span>
                    {sourceRange ? (
                      <button
                        type="button"
                        onClick={() => setSourceRange(undefined)}
                      >
                        Hide source
                      </button>
                    ) : null}
                  </div>
                </div>
                <ProjectNarrativeGraph
                  flow={activeFlow}
                  onSelectSource={selectProjectSource}
                  onOpenFunction={openProjectFunction}
                />
              </>
            ) : (
              <div className="empty-state">
                <span>◇</span>
                <h1>No project narrative yet</h1>
                <p>
                  Define the few flows people need to understand in{' '}
                  <code>.shishan/project.json</code>. ShiShan will validate and
                  bind its nodes to real source symbols.
                </p>
              </div>
            )
          ) : narrative ? (
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

        {showSource ? (
          <SourcePanel
            range={sourceRange}
            version={
              sourceRange
                ? project.files.get(sourceRange.path)?.contentHash
                : undefined
            }
            staticSources={STATIC_DATA?.sources}
            staticMode={Boolean(STATIC_DATA)}
          />
        ) : null}
      </div>
    </div>
  );
}
