import { memo, useMemo, useState } from 'react';
import Dagre from '@dagrejs/dagre';
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
  loop: 'Loop'
};
const MAX_GRAPH_NODES = 200;

function NarrativeCard({
  narrative,
  onSelectSource
}: NarrativeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const condition = narrative.fields.condition?.[0];

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
      {condition ? (
        <p className="condition">
          <span>If</span> {condition}
        </p>
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

function limitedNodes(root: NarrativeNode): {
  narratives: NarrativeNode[];
  truncated: boolean;
} {
  const narratives: NarrativeNode[] = [];
  const stack = [root];
  while (stack.length > 0 && narratives.length < MAX_GRAPH_NODES) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    narratives.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return { narratives, truncated: stack.length > 0 };
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

function layout(
  root: NarrativeNode,
  onSelectSource: (range: SourceRange) => void
): { nodes: Node[]; edges: Edge[]; truncated: boolean } {
  const width = 286;
  const height = 150;
  const graph = new Dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 74,
    nodesep: 46,
    marginx: 24,
    marginy: 24
  });

  const limited = limitedNodes(root);
  const narratives = limited.narratives;
  const visibleIds = new Set(narratives.map((narrative) => narrative.id));
  const narrativeEdges = narratives
    .flatMap((narrative) => narrative.edges)
    .filter(
      (item) => visibleIds.has(item.source) && visibleIds.has(item.target)
    );
  for (const narrative of narratives) {
    graph.setNode(narrative.id, { width, height });
  }
  for (const item of narrativeEdges) {
    graph.setEdge(item.source, item.target);
  }
  Dagre.layout(graph);

  const nodes: Node[] = narratives.map((narrative) => {
    const position = graph.node(narrative.id) as { x: number; y: number };
    return {
      id: narrative.id,
      position: {
        x: position.x - width / 2,
        y: position.y - height / 2
      },
      style: {
        width,
        border: 'none',
        background: 'transparent',
        padding: 0
      },
      data: {
        label: (
          <NarrativeCard
            narrative={narrative}
            onSelectSource={onSelectSource}
          />
        )
      }
    };
  });
  const edges: Edge[] = narrativeEdges.map((item) => ({
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
    style: {
      strokeWidth: 1.8
    }
  }));
  return { nodes, edges, truncated: limited.truncated };
}

export const NarrativeGraph = memo(function NarrativeGraph({
  narrative,
  onSelectSource
}: NarrativeGraphProps) {
  const graph = useMemo(
    () => layout(narrative, onSelectSource),
    [narrative, onSelectSource]
  );

  return (
    <div className="graph-canvas" data-testid="narrative-graph">
      <ReactFlow
        key={narrative.id}
        nodes={graph.nodes}
        edges={graph.edges}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
        minZoom={0.35}
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
      {graph.truncated ? (
        <div className="graph-limit">
          Showing the first {MAX_GRAPH_NODES} narrative nodes.
        </div>
      ) : null}
    </div>
  );
});
