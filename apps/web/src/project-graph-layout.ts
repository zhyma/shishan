import Dagre from '@dagrejs/dagre';
import type { ProjectNarrativeFlow } from '@shishan/protocol';
import type { GraphPosition } from './graph-layout.js';

export const PROJECT_NODE_WIDTH = 276;
export const PROJECT_NODE_HEIGHT = 148;
export type ProjectFlowDirection = 'LR' | 'TB';

// @shishan function layout-project-flow
// @summary Arrange one named project flow as a readable left-to-right story
// @input bounded project narrative flow
// @output stable node positions for the interactive overview
export function layoutProjectFlow(
  flow: ProjectNarrativeFlow,
  direction: ProjectFlowDirection = 'LR'
): ReadonlyMap<string, GraphPosition> {
  const graph = new Dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: 92,
    nodesep: 54,
    marginx: 36,
    marginy: 36
  });

  for (const node of flow.nodes) {
    graph.setNode(node.id, {
      width: PROJECT_NODE_WIDTH,
      height: PROJECT_NODE_HEIGHT
    });
  }
  for (const edge of flow.edges) {
    graph.setEdge(edge.source, edge.target);
  }
  Dagre.layout(graph);

  return new Map(
    flow.nodes.map((node) => {
      const position = graph.node(node.id) as { x: number; y: number };
      return [
        node.id,
        {
          x: position.x - PROJECT_NODE_WIDTH / 2,
          y: position.y - PROJECT_NODE_HEIGHT / 2
        }
      ];
    })
  );
}
