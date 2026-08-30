import { memo, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import type {
  NarrativeEdge,
  NarrativeNode,
  SourceRange
} from '@shishan/protocol';
import {
  GRAPH_NODE_WIDTH,
  MAX_GRAPH_NODES,
  initialGraphMinZoom,
  layoutWithDagre,
  needsLargeGraphLayout,
  prepareGraph,
  resolveLargeGraphLayout,
  type GraphPosition
} from './graph-layout.js';

interface NarrativeGraphProps {
  narrative: NarrativeNode;
  onSelectSource(range: SourceRange): void;
}

interface NarrativeCardProps {
  narrative: NarrativeNode;
  onSelectSource(range: SourceRange): void;
}

const kindLabels: Record<NarrativeNode['kind'], string> = {
  function: 'Function',
  step: 'Step',
  branch: 'Decision',
  loop: 'Loop',
  call: 'Call',
  error: 'Error boundary',
  async: 'Async wait'
};

function NarrativeCard({
  narrative,
  onSelectSource
}: NarrativeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const semanticFields = [
    ['If', narrative.fields.condition],
    ['Calls', narrative.fields.target],
    ['Failure', narrative.fields.failure],
    ['Resume', narrative.fields.resume]
  ]
    .flatMap(([label, values]) =>
      Array.isArray(values)
        ? values.slice(0, 2).map((value) => ({ label, value }))
        : []
    );

  return (
    <article className={'narrative-card kind-' + narrative.kind}>
      <div className="card-kicker">
        <span>{kindLabels[narrative.kind]}</span>
        <button
          className="source-link"
          type="button"
          onClick={() => onSelectSource(narrative.source)}
        >
          L{narrative.source.start.line + 1}
        </button>
      </div>
      <h3>{narrative.name ?? narrative.localId}</h3>
      <p>{narrative.summary || 'No summary provided.'}</p>
      {semanticFields.length > 0 ? (
        <dl className="semantic-fields">
          {semanticFields.map((field, index) => (
            <div key={field.label + ':' + index}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {narrative.details.length > 0 ? (
        <div className="detail-area">
          <button
            className="detail-toggle"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <span>{narrative.details.length}</span>
            implementation {narrative.details.length === 1 ? 'note' : 'notes'}
          </button>
          {expanded ? (
            <ul>
              {narrative.details.map((detail) => (
                <li key={detail.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSource(detail.source)}
                  >
                    {detail.summary}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function edgeLabel(kind: NarrativeEdge['kind'], label?: string): string {
  if (label) {
    return label;
  }
  switch (kind) {
    case 'true':
      return 'Yes';
    case 'false':
      return 'Otherwise';
    case 'body':
      return 'Repeat';
    case 'exit':
      return 'Continue';
    default:
      return '';
  }
}

export const NarrativeGraph = memo(function NarrativeGraph({
  narrative,
  onSelectSource
}: NarrativeGraphProps) {
  const model = useMemo(() => prepareGraph(narrative), [narrative]);
  const fallbackPositions = useMemo(() => layoutWithDagre(model), [model]);
  const [largePositions, setLargePositions] = useState<
    ReadonlyMap<string, GraphPosition> | undefined
  >();
  const [layoutStatus, setLayoutStatus] = useState<
    'dagre' | 'loading' | 'elk' | 'fallback'
  >('dagre');

  useEffect(() => {
    let active = true;
    setLargePositions(undefined);
    if (!needsLargeGraphLayout(model)) {
      setLayoutStatus('dagre');
      return () => {
        active = false;
      };
    }

    setLayoutStatus('loading');
    void resolveLargeGraphLayout(model, async () => {
      const { layoutWithElk } = await import('./elk-layout.js');
      return layoutWithElk(model);
    }).then((result) => {
      if (active) {
        setLargePositions(result.positions);
        setLayoutStatus(result.engine);
      }
    });
    return () => {
      active = false;
    };
  }, [model]);

  const positions = largePositions ?? fallbackPositions;
  const fitViewMinZoom = initialGraphMinZoom(model.narratives.length);
  const nodes = useMemo<Node[]>(
    () =>
      model.narratives.map((item) => ({
        id: item.id,
        position: positions.get(item.id) ?? { x: 0, y: 0 },
        style: {
          width: GRAPH_NODE_WIDTH,
          border: 'none',
          background: 'transparent',
          padding: 0
        },
        data: {
          label: (
            <NarrativeCard
              narrative={item}
              onSelectSource={onSelectSource}
            />
          )
        }
      })),
    [model.narratives, onSelectSource, positions]
  );
  const edges = useMemo<Edge[]>(
    () =>
      model.edges.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: edgeLabel(item.kind, item.label),
        type: 'smoothstep',
        animated: item.kind === 'body',
        className: 'edge-' + item.kind,
        labelStyle: {
          fill: '#54615b',
          fontSize: 11,
          fontWeight: 650
        },
        style: { strokeWidth: 1.8 }
      })),
    [model.edges]
  );

  return (
    <div
      className="graph-canvas"
      data-testid="narrative-graph"
      data-layout-engine={layoutStatus}
      data-visible-nodes={model.narratives.length}
    >
      <ReactFlow
        key={narrative.id + ':' + layoutStatus}
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: fitViewMinZoom, maxZoom: 1.05 }}
        minZoom={0.08}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          color="#d5ddd7"
          gap={22}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <MiniMap
          pannable
          zoomable
          nodeColor="#a9b9af"
          maskColor="rgba(246, 248, 244, 0.82)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      {layoutStatus === 'loading' ? (
        <div className="graph-limit">Optimizing large graph layout…</div>
      ) : null}
      {layoutStatus === 'fallback' ? (
        <div className="graph-limit">ELK timed out; using safe fallback layout.</div>
      ) : null}
      {model.truncated ? (
        <div className="graph-limit graph-limit-truncated">
          Showing the first {MAX_GRAPH_NODES} narrative nodes.
        </div>
      ) : null}
    </div>
  );
});
