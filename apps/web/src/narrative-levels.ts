import type {
  NarrativeDetail,
  NarrativeNode,
  ProjectNarrativeEdge,
  ProjectNarrativeFlow,
  ProjectNarrativeNode
} from '@shishan/protocol';

export const MAX_NODE_INSPECTOR_ITEMS = 300;

export interface NarrativeOutlineItem {
  node: NarrativeNode;
  depth: number;
}

export interface NarrativeDetailItem {
  detail: NarrativeDetail;
  parent: NarrativeNode;
  depth: number;
}

export interface ProjectNodeRelation {
  edge: ProjectNarrativeEdge;
  node?: ProjectNarrativeNode;
}

// @shishan function narrative-outline
// @summary Flatten a nested function narrative in stable reading order
// @input root narrative node
// @output bounded nodes paired with their display depth
export function narrativeOutline(
  root: NarrativeNode
): NarrativeOutlineItem[] {
  const result: NarrativeOutlineItem[] = [];
  const stack: NarrativeOutlineItem[] = [{ node: root, depth: 0 }];
  while (stack.length > 0 && result.length < MAX_NODE_INSPECTOR_ITEMS) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    result.push(current);
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      const child = current.node.children[index];
      if (child) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
  return result;
}

// @shishan function narrative-details
// @summary Collect implementation details from a function and all nested narrative nodes
// @input root narrative node
// @output bounded details with their parent narrative and depth
export function narrativeDetails(root: NarrativeNode): NarrativeDetailItem[] {
  return narrativeOutline(root)
    .flatMap(({ node, depth }) =>
      node.details.map((detail) => ({ detail, parent: node, depth }))
    )
    .slice(0, MAX_NODE_INSPECTOR_ITEMS);
}

// @shishan function project-node-relations
// @summary Resolve the incoming and outgoing neighbors of one project narrative node
// @input project flow and node identifier
// @output labeled incoming and outgoing relationships
export function projectNodeRelations(
  flow: ProjectNarrativeFlow,
  nodeId: string
): { incoming: ProjectNodeRelation[]; outgoing: ProjectNodeRelation[] } {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  return {
    incoming: flow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => ({ edge, node: nodes.get(edge.source) })),
    outgoing: flow.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => ({ edge, node: nodes.get(edge.target) }))
  };
}
