export interface PreviewSourcePosition {
  line: number;
  column: number;
}

export interface PreviewSourceRange {
  path: string;
  start: PreviewSourcePosition;
  end: PreviewSourcePosition;
}

export interface PreviewOutlineItem {
  id: string;
  kind: string;
  label: string;
  summary: string;
  depth: number;
  source?: PreviewSourceRange;
}

export interface PreviewDetailItem {
  id: string;
  parentLabel: string;
  summary: string;
  coveredStatements: number;
  source?: PreviewSourceRange;
}

export interface PreviewNodeDrilldown {
  narrativeFound: boolean;
  outline: PreviewOutlineItem[];
  details: PreviewDetailItem[];
}

const MAX_PREVIEW_ITEMS = 300;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function position(value: unknown): PreviewSourcePosition | undefined {
  const candidate = record(value);
  if (
    !candidate ||
    !Number.isInteger(candidate.line) ||
    !Number.isInteger(candidate.column) ||
    (candidate.line as number) < 0 ||
    (candidate.column as number) < 0
  ) {
    return undefined;
  }
  return {
    line: candidate.line as number,
    column: candidate.column as number
  };
}

function sourceRange(value: unknown): PreviewSourceRange | undefined {
  const candidate = record(value);
  const path = text(candidate?.path);
  const start = position(candidate?.start);
  const end = position(candidate?.end);
  return path && start && end ? { path, start, end } : undefined;
}

// @shishan function extract-node-drilldown
// @summary Resolve one project node to its nested function flow and implementation details
// @input inert project snapshot
// @input project flow and node identifiers
// @output bounded preview model safe for the VS Code Webview
export function extractNodeDrilldown(
  snapshot: unknown,
  flowId: string,
  nodeId: string
): PreviewNodeDrilldown {
  const root = record(snapshot);
  const projectNarrative = record(root?.projectNarrative);
  const flow = Array.isArray(projectNarrative?.flows)
    ? projectNarrative.flows
        .map(record)
        .find((item) => text(item?.id) === flowId)
    : undefined;
  const projectNode = Array.isArray(flow?.nodes)
    ? flow.nodes.map(record).find((item) => text(item?.id) === nodeId)
    : undefined;
  const projectSource = record(projectNode?.source);
  const narrativeId = text(projectSource?.narrativeId);
  const sourcePath = text(projectSource?.path);
  const file =
    sourcePath && Array.isArray(root?.files)
      ? root.files
          .map(record)
          .find((item) => text(item?.path) === sourcePath)
      : undefined;
  const narrative =
    narrativeId && Array.isArray(file?.functions)
      ? file.functions
          .map(record)
          .find((item) => text(item?.id) === narrativeId)
      : undefined;

  if (!narrative) {
    return { narrativeFound: false, outline: [], details: [] };
  }

  const outline: PreviewOutlineItem[] = [];
  const details: PreviewDetailItem[] = [];
  const visited = new Set<Record<string, unknown>>();
  const visit = (item: Record<string, unknown>, depth: number): void => {
    if (visited.has(item) || outline.length >= MAX_PREVIEW_ITEMS) {
      return;
    }
    visited.add(item);
    const id = text(item.id);
    const localId = text(item.localId);
    const summary = text(item.summary);
    if (!id || !localId || !summary) {
      return;
    }
    outline.push({
      id,
      kind: text(item.kind) ?? 'step',
      label: text(item.name) ?? localId,
      summary,
      depth,
      ...(sourceRange(item.source) ? { source: sourceRange(item.source) } : {})
    });

    if (Array.isArray(item.details)) {
      for (const candidate of item.details) {
        if (details.length >= MAX_PREVIEW_ITEMS) {
          break;
        }
        const detail = record(candidate);
        const detailId = text(detail?.id);
        const detailSummary = text(detail?.summary);
        if (!detail || !detailId || !detailSummary) {
          continue;
        }
        const range = sourceRange(detail.source);
        details.push({
          id: detailId,
          parentLabel: text(item.name) ?? localId,
          summary: detailSummary,
          coveredStatements: Number.isInteger(detail.coveredStatements)
            ? Math.max(0, detail.coveredStatements as number)
            : 0,
          ...(range ? { source: range } : {})
        });
      }
    }

    if (Array.isArray(item.children)) {
      for (const child of item.children) {
        const childRecord = record(child);
        if (childRecord) {
          visit(childRecord, depth + 1);
        }
      }
    }
  };
  visit(narrative, 0);
  return { narrativeFound: true, outline, details };
}
