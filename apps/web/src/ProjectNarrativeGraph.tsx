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

interface ProjectNarrativeGraphProps {
  flow: ProjectNarrativeFlow;
  onSelectSource(node: ProjectNarrativeNode): void;
  onOpenFunction(node: ProjectNarrativeNode): void;
}

interface ProjectCardProps {
  node: ProjectNarrativeNode;
  onSelectSource(node: ProjectNarrativeNode): void;
  onOpenFunction(node: ProjectNarrativeNode): void;
}

const kindLabels: Record<ProjectNarrativeNode['kind'], string> = {
  entry: 'Entry',
  module: 'Module',
  process: 'Process',
  decision: 'Decision',
  error: 'Error path',
  output: 'Output',
  external: 'External system'
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
  onSelectSource,
  onOpenFunction
}: ProjectCardProps) {
  return (
    <article className={'project-card project-kind-' + node.kind}>
      <div className="project-card-kicker">
        <span>{kindLabels[node.kind]}</span>
        <span>{node.id}</span>
      </div>
      <h3>{node.label}</h3>
      <p>{node.summary}</p>
      {node.source ? (
        <div className="project-card-actions">
          <button type="button" onClick={() => onSelectSource(node)}>
            {node.source.symbol ?? node.source.path}
          </button>
          {node.source.narrativeId ? (
            <button type="button" onClick={() => onOpenFunction(node)}>
              Function story →
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function edgeLabel(edge: ProjectNarrativeEdge): string {
  if (edge.label) {
    return edge.label;
  }
  switch (edge.kind) {
    case 'true':
      return 'Yes';
    case 'false':
      return 'No';
    case 'calls':
      return 'Calls';
    case 'error':
      return 'Failure';
    case 'data':
      return 'Data';
    default:
      return '';
  }
}

export const ProjectNarrativeGraph = memo(function ProjectNarrativeGraph({
  flow,
  onSelectSource,
  onOpenFunction
}: ProjectNarrativeGraphProps) {
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
        data: {
          label: (
            <ProjectCard
              node={item}
              onSelectSource={onSelectSource}
              onOpenFunction={onOpenFunction}
            />
          )
        }
      })),
    [flow.nodes, onOpenFunction, onSelectSource, positions]
  );
  const edges = useMemo<Edge[]>(
    () =>
      flow.edges.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: edgeLabel(item),
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
    [flow.edges]
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
