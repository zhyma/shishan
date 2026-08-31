import ELK from 'elkjs/lib/elk-api.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  type GraphModel,
  type GraphPosition
} from './graph-layout.js';
import { withTimeBudget } from './layout-budget.js';

export const ELK_LAYOUT_TIMEOUT_MS = 5_000;

export async function layoutWithElk(
  model: GraphModel
): Promise<ReadonlyMap<string, GraphPosition>> {
  const elk = new ELK({ workerUrl: elkWorkerUrl });
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '46',
      'elk.layered.spacing.nodeNodeBetweenLayers': '74',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]'
    },
    children: model.narratives.map((item) => ({
      id: item.id,
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT
    })),
    edges: model.edges.map((item) => ({
      id: item.id,
      sources: [item.source],
      targets: [item.target]
    }))
  };

  try {
    const result = await withTimeBudget(
      elk.layout(graph),
      ELK_LAYOUT_TIMEOUT_MS
    );
    return new Map(
      (result.children ?? []).map((item) => [
        item.id,
        { x: item.x ?? 0, y: item.y ?? 0 }
      ])
    );
  } finally {
    elk.terminateWorker();
  }
}
