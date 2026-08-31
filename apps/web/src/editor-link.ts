import type { SourceRange } from '@shishan/protocol';

export function vscodeSourceUrl(range: SourceRange): string {
  const query = new URLSearchParams({
    path: range.path,
    line: String(range.start.line + 1),
    column: String(range.start.column + 1)
  });
  return 'vscode://zhyma.shishan-vscode/open?' + query.toString();
}
