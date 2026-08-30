import { isAbsolute, relative, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';

export interface SourceTarget {
  path: string;
  line: number;
  column: number;
}

function positiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// @shishan function resolve-source-target
// @summary Validate a browser source link and keep it inside the workspace
// @input workspaceRoot
// @input query
// @output a normalized source target
export function resolveSourceTarget(
  workspaceRoot: string,
  query: string
): SourceTarget | undefined {
  const values = new URLSearchParams(query);
  const requestedPath = values.get('path');
  if (!requestedPath || isAbsolute(requestedPath)) {
    return undefined;
  }

  const targetPath = resolve(workspaceRoot, requestedPath);
  const relation = relative(workspaceRoot, targetPath);
  if (relation === '..' || relation.startsWith('../') || isAbsolute(relation)) {
    return undefined;
  }

  return {
    path: targetPath,
    line: positiveInteger(values.get('line'), 1),
    column: positiveInteger(values.get('column'), 1)
  };
}

export async function resolveExistingSourceTarget(
  workspaceRoot: string,
  query: string
): Promise<SourceTarget | undefined> {
  const target = resolveSourceTarget(workspaceRoot, query);
  if (!target) {
    return undefined;
  }
  try {
    const [realRoot, realTarget] = await Promise.all([
      realpath(workspaceRoot),
      realpath(target.path)
    ]);
    const relation = relative(realRoot, realTarget);
    if (relation === '..' || relation.startsWith('../') || isAbsolute(relation)) {
      return undefined;
    }
    return { ...target, path: realTarget };
  } catch {
    return undefined;
  }
}
