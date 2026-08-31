export interface ProjectManifestSource {
  path: string;
  symbol?: string;
}

export interface ProjectManifestNode {
  id: string;
  kind: string;
  label: string;
  summary: string;
  source?: ProjectManifestSource;
}

export interface ProjectManifestFlow {
  id: string;
  title: string;
  summary: string;
  nodes: ProjectManifestNode[];
  edges: ProjectManifestEdge[];
}

export interface ProjectManifestEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string;
}

export interface ProjectManifest {
  schemaVersion: string;
  title: string;
  summary: string;
  entryFlow: string;
  flows: ProjectManifestFlow[];
}

export interface ProjectManifestParseResult {
  manifest?: ProjectManifest;
  error?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// @shishan function parse-project-manifest
// @summary Decode the bounded inert project manifest for VS Code node cards and outline navigation
// @input bounded JSON text
// @output safe display model or a concise error
export function parseProjectManifest(
  content: string
): ProjectManifestParseResult {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    return {
      error:
        'project.json is not valid JSON: ' +
        (error instanceof Error ? error.message : String(error))
    };
  }
  const root = record(value);
  if (
    !root ||
    root.schemaVersion !== 'shishan/project-v1' ||
    !text(root.title) ||
    !text(root.summary) ||
    !text(root.entryFlow) ||
    !Array.isArray(root.flows)
  ) {
    return { error: 'project.json does not match shishan/project-v1.' };
  }

  const flows: ProjectManifestFlow[] = [];
  for (const candidate of root.flows) {
    const flow = record(candidate);
    if (
      !flow ||
      !text(flow.id) ||
      !text(flow.title) ||
      !text(flow.summary) ||
      !Array.isArray(flow.nodes) ||
      !Array.isArray(flow.edges)
    ) {
      return { error: 'project.json contains an invalid flow.' };
    }
    const nodes: ProjectManifestNode[] = [];
    for (const candidateNode of flow.nodes) {
      const node = record(candidateNode);
      if (
        !node ||
        !text(node.id) ||
        !text(node.kind) ||
        !text(node.label) ||
        !text(node.summary)
      ) {
        return { error: 'project.json contains an invalid narrative node.' };
      }
      const source = node.source === undefined ? undefined : record(node.source);
      if (node.source !== undefined && (!source || !text(source.path))) {
        return { error: 'project.json contains an invalid source reference.' };
      }
      nodes.push({
        id: node.id as string,
        kind: node.kind as string,
        label: node.label as string,
        summary: node.summary as string,
        ...(source
          ? {
              source: {
                path: source.path as string,
                ...(text(source.symbol)
                  ? { symbol: source.symbol as string }
                  : {})
              }
            }
          : {})
      });
    }
    const edges: ProjectManifestEdge[] = [];
    for (const candidateEdge of flow.edges) {
      const edge = record(candidateEdge);
      if (
        !edge ||
        !text(edge.id) ||
        !text(edge.source) ||
        !text(edge.target) ||
        !text(edge.kind)
      ) {
        return { error: 'project.json contains an invalid narrative edge.' };
      }
      edges.push({
        id: edge.id as string,
        source: edge.source as string,
        target: edge.target as string,
        kind: edge.kind as string,
        ...(text(edge.label) ? { label: edge.label as string } : {})
      });
    }
    flows.push({
      id: flow.id as string,
      title: flow.title as string,
      summary: flow.summary as string,
      nodes,
      edges
    });
  }
  if (flows.length === 0) {
    return { error: 'project.json must contain at least one flow.' };
  }
  return {
    manifest: {
      schemaVersion: root.schemaVersion,
      title: root.title as string,
      summary: root.summary as string,
      entryFlow: root.entryFlow as string,
      flows
    }
  };
}
