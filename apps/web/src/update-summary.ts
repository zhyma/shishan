export function updatePathSummary(paths: readonly string[], generation: number): string {
  if (paths.length === 0) {
    return 'reused cached files';
  }
  if (generation === 1) {
    return 'initial snapshot · ' + paths.length + (paths.length === 1 ? ' file' : ' files');
  }
  if (paths.length <= 2) {
    return paths.join(', ');
  }
  return paths.slice(0, 2).join(', ') + ' +' + (paths.length - 2) + ' more';
}
