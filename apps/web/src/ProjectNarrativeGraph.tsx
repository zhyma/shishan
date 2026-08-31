import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance
} from '@xyflow/react';
import type {
  ProjectNarrativeEdge,
  ProjectNarrativeFlow,
  ProjectNarrativeNode
} from '@shishan/protocol';
import {
  PROJECT_NODE_WIDTH,
  layoutProjectFlow
} from './project-graph-layout.js';
import { useI18n, type MessageKey } from './i18n.js';

interface ProjectNarrativeGraphProps {
  flow: ProjectNarrativeFlow;
  selectedNodeId?: string;
  onInspect(node: ProjectNarrativeNode): void;
  onSelectSource(node: ProjectNarrativeNode): void;
  onOpenFunction(node: ProjectNarrativeNode): void;
}

interface ProjectCardProps {
  node: ProjectNarrativeNode;
  onInspect(node: ProjectNarrativeNode): void;
  onSelectSource(node: ProjectNarrativeNode): void;
  onOpenFunction(node: ProjectNarrativeNode): void;
}

const kindLabelKeys: Record<ProjectNarrativeNode['kind'], MessageKey> = {
  entry: 'node.kind.entry',
  module: 'node.kind.module',
  process: 'node.kind.process',
  decision: 'node.kind.decision',
  error: 'node.kind.error',
  output: 'node.kind.output',
  external: 'node.kind.external'
};

const NARROW_GRAPH_QUERY = '(max-width: 760px)';

function narrowProjectGraph(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia(NARROW_GRAPH_QUERY).matches
  );
}

function useNarrowProjectGraph(): boolean {
  const [narrow, setNarrow] = useState(narrowProjectGraph);

  useEffect(() => {
    const media = window.matchMedia(NARROW_GRAPH_QUERY);
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  return narrow;
}

function ProjectCard({
  node,
  onInspect,
  onSelectSource,
  onOpenFunction
}: ProjectCardProps) {
  const { t } = useI18n();
  return (
    <article className={'project-card project-kind-' + node.kind}>
      <div className="project-card-kicker">
        <span>{t(kindLabelKeys[node.kind])}</span>
        <span>{node.id}</span>
      </div>
      <h3>{node.label}</h3>
      <p>{node.summary}</p>
      <div className="project-card-actions">
        <button type="button" onClick={() => onInspect(node)}>
          {t('node.details')}
        </button>
        {node.source?.narrativeId ? (
          <button type="button" onClick={() => onOpenFunction(node)}>
            {t('node.functionStory')}
          </button>
        ) : node.source ? (
          <button type="button" onClick={() => onSelectSource(node)}>
            {node.source.symbol ?? t('node.source')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function edgeLabel(
  edge: ProjectNarrativeEdge,
  t: (key: MessageKey) => string
): string {
  if (edge.label) {
    return edge.label;
  }
  switch (edge.kind) {
    case 'true':
      return t('edge.yes');
    case 'false':
      return t('edge.no');
    case 'calls':
      return t('edge.calls');
    case 'error':
      return t('edge.failure');
    case 'data':
      return t('edge.data');
    default:
      return '';
  }
}

export const ProjectNarrativeGraph = memo(function ProjectNarrativeGraph({
  flow,
  selectedNodeId,
  onInspect,
  onSelectSource,
  onOpenFunction
}: ProjectNarrativeGraphProps) {
  const { t } = useI18n();
  const narrow = useNarrowProjectGraph();
  const canvas = useRef<HTMLDivElement>(null);
  const positions = useMemo(
    () => layoutProjectFlow(flow, narrow ? 'TB' : 'LR'),
    [flow, narrow]
  );
  const entryNode = useMemo(
    () =>
      flow.nodes.find(
        (node) => !flow.edges.some((edge) => edge.target === node.id)
      ) ?? flow.nodes[0],
    [flow.edges, flow.nodes]
  );
  const focusEntry = useCallback(
    (instance: ReactFlowInstance) => {
      if (!narrow || !entryNode) {
        return;
      }
      const position = positions.get(entryNode.id);
      const bounds = canvas.current?.getBoundingClientRect();
      if (!position || !bounds) {
        return;
      }
      const zoom = 0.9;
      void instance.setViewport({
        x:
          bounds.width / 2 -
          (position.x + PROJECT_NODE_WIDTH / 2) * zoom,
        y: 32 - position.y * zoom,
        zoom
      });
    },
    [entryNode, narrow, positions]
  );
  const nodes = useMemo<Node[]>(
    () =>
      flow.nodes.map((item) => ({
        id: item.id,
        position: positions.get(item.id) ?? { x: 0, y: 0 },
        style: {
          width: PROJECT_NODE_WIDTH,
          border: 'none',
          background: 'transparent',
          padding: 0
        },
        className: item.id === selectedNodeId ? 'project-node-selected' : '',
        data: {
          label: (
            <ProjectCard
              node={item}
              onInspect={onInspect}
              onSelectSource={onSelectSource}
              onOpenFunction={onOpenFunction}
            />
          )
        }
      })),
    [flow.nodes, onInspect, onOpenFunction, onSelectSource, positions, selectedNodeId]
  );
  const edges = useMemo<Edge[]>(
    () =>
      flow.edges.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: edgeLabel(item, t),
        type: 'smoothstep',
        animated: item.kind === 'calls',
        className: 'project-edge-' + item.kind,
        labelStyle: {
          fill: '#506058',
          fontSize: 11,
          fontWeight: 700
        },
        style: { strokeWidth: 2 }
      })),
    [flow.edges, t]
  );

  return (
    <div
      ref={canvas}
      className="project-graph-canvas"
      data-testid="project-narrative-graph"
      data-flow-id={flow.id}
      data-visible-nodes={flow.nodes.length}
    >
      <ReactFlow
        key={flow.id + (narrow ? ':narrow' : ':wide')}
        nodes={nodes}
        edges={edges}
        fitView={!narrow}
        fitViewOptions={{ padding: 0.18, minZoom: 0.42, maxZoom: 1.05 }}
        onInit={focusEntry}
        minZoom={0.12}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          color="#ced9d1"
          gap={22}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        {!narrow ? (
          <MiniMap
            pannable
            zoomable
            nodeColor="#829b8a"
            maskColor="rgba(244, 247, 242, 0.82)"
          />
        ) : null}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
});
