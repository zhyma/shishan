import { translate, type UiLocale } from './i18n.js';

export function updatePathSummary(
  paths: readonly string[],
  generation: number,
  locale: UiLocale = 'en'
): string {
  if (paths.length === 0) {
    return translate(locale, 'update.reused');
  }
  if (generation === 1) {
    return translate(locale, 'update.initial', {
      count: paths.length,
      unit: translate(
        locale,
        paths.length === 1 ? 'update.file' : 'update.files'
      )
    });
  }
  if (paths.length <= 2) {
    return paths.join(', ');
  }
  return translate(locale, 'update.more', {
    paths: paths.slice(0, 2).join(', '),
    count: paths.length - 2
  });
}
