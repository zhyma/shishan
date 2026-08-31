import Dagre from '@dagrejs/dagre';
import type { NarrativeEdge, NarrativeNode } from '@shishan/protocol';

export const LARGE_GRAPH_THRESHOLD = 80;
export const MAX_GRAPH_NODES = 600;
export const GRAPH_NODE_WIDTH = 286;
export const GRAPH_NODE_HEIGHT = 176;

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GraphModel {
  narratives: NarrativeNode[];
  edges: NarrativeEdge[];
  truncated: boolean;
}

export interface LargeGraphLayoutResult {
  positions: ReadonlyMap<string, GraphPosition>;
  engine: 'elk' | 'fallback';
}

export function narrativeNodeLabel(root: NarrativeNode): string {
  let count = 0;
  const stack = [root];
  while (stack.length > 0 && count <= MAX_GRAPH_NODES) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    count += 1;
    stack.push(...node.children);
  }
  return count > MAX_GRAPH_NODES
    ? MAX_GRAPH_NODES + '+ nodes'
    : count + (count === 1 ? ' node' : ' nodes');
}

export function initialGraphMinZoom(nodeCount: number): number {
  return nodeCount <= 20 ? 0.42 : 0.08;
}

export function prepareGraph(root: NarrativeNode): GraphModel {
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

  const visibleIds = new Set(narratives.map((item) => item.id));
  return {
    narratives,
    edges: narratives
      .flatMap((item) => item.edges)
      .filter(
        (item) => visibleIds.has(item.source) && visibleIds.has(item.target)
      ),
    truncated: stack.length > 0
  };
}

export function needsLargeGraphLayout(model: GraphModel): boolean {
  return model.narratives.length > LARGE_GRAPH_THRESHOLD;
}

export function layoutWithDagre(
  model: GraphModel
): ReadonlyMap<string, GraphPosition> {
  const graph = new Dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 74,
    nodesep: 46,
    marginx: 24,
    marginy: 24
  });

  for (const narrative of model.narratives) {
    graph.setNode(narrative.id, {
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT
    });
  }
  for (const item of model.edges) {
    graph.setEdge(item.source, item.target);
  }
  Dagre.layout(graph);

  return new Map(
    model.narratives.map((narrative) => {
      const position = graph.node(narrative.id) as { x: number; y: number };
      return [
        narrative.id,
        {
          x: position.x - GRAPH_NODE_WIDTH / 2,
          y: position.y - GRAPH_NODE_HEIGHT / 2
        }
      ];
    })
  );
}

export async function resolveLargeGraphLayout(
  model: GraphModel,
  layout: () => Promise<ReadonlyMap<string, GraphPosition>>
): Promise<LargeGraphLayoutResult> {
  try {
    const positions = await layout();
    if (model.narratives.some((item) => !positions.has(item.id))) {
      throw new Error('Large graph layout omitted visible nodes.');
    }
    return { positions, engine: 'elk' };
  } catch {
    return { positions: layoutWithDagre(model), engine: 'fallback' };
  }
}
