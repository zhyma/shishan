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
import { useI18n, type MessageKey } from './i18n.js';

interface NarrativeGraphProps {
  narrative: NarrativeNode;
  onSelectSource(range: SourceRange): void;
}

interface NarrativeCardProps {
  narrative: NarrativeNode;
  onSelectSource(range: SourceRange): void;
}

const kindLabelKeys: Record<NarrativeNode['kind'], MessageKey> = {
  function: 'narrative.kind.function',
  step: 'narrative.kind.step',
  branch: 'narrative.kind.branch',
  loop: 'narrative.kind.loop',
  call: 'narrative.kind.call',
  error: 'narrative.kind.error',
  async: 'narrative.kind.async'
};

function NarrativeCard({
  narrative,
  onSelectSource
}: NarrativeCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const semanticFields = [
    ['field.condition', narrative.fields.condition],
    ['field.target', narrative.fields.target],
    ['field.failure', narrative.fields.failure],
    ['field.resume', narrative.fields.resume]
  ]
    .flatMap(([key, values]) =>
      Array.isArray(values)
        ? values.slice(0, 2).map((value) => ({
            label: t(key as MessageKey),
            value
          }))
        : []
    );

  return (
    <article className={'narrative-card kind-' + narrative.kind}>
      <div className="card-kicker">
        <span>{t(kindLabelKeys[narrative.kind])}</span>
        <button
          className="source-link"
          type="button"
          onClick={() => onSelectSource(narrative.source)}
        >
          L{narrative.source.start.line + 1}
        </button>
      </div>
      <h3>{narrative.name ?? narrative.localId}</h3>
      <p>{narrative.summary || t('summary.missing')}</p>
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
            {t(
              narrative.details.length === 1
                ? 'details.note'
                : 'details.notes'
            )}
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

function edgeLabel(
  kind: NarrativeEdge['kind'],
  t: (key: MessageKey) => string,
  label?: string
): string {
  if (label) {
    return label;
  }
  switch (kind) {
    case 'true':
      return t('edge.yes');
    case 'false':
      return t('edge.otherwise');
    case 'body':
      return t('edge.repeat');
    case 'exit':
      return t('edge.continue');
    default:
      return '';
  }
}

export const NarrativeGraph = memo(function NarrativeGraph({
  narrative,
  onSelectSource
}: NarrativeGraphProps) {
  const { t } = useI18n();
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
        label: edgeLabel(item.kind, t, item.label),
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
    [model.edges, t]
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
        <div className="graph-limit">{t('graph.optimizing')}</div>
      ) : null}
      {layoutStatus === 'fallback' ? (
        <div className="graph-limit">{t('graph.fallback')}</div>
      ) : null}
      {model.truncated ? (
        <div className="graph-limit graph-limit-truncated">
          {t('graph.truncated', { count: MAX_GRAPH_NODES })}
        </div>
      ) : null}
    </div>
  );
});
