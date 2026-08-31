import { describe, expect, it } from 'vitest';
import { resolveUiLocale, translate } from './i18n.js';

describe('Web interface localization', () => {
  it('prefers an explicit Chinese locale and interpolates counts', () => {
    expect(resolveUiLocale('zh-CN', 'en', 'en-US')).toBe('zh-CN');
    expect(translate('zh-CN', 'project.nodes', { count: 6 })).toBe(
      '6 个节点'
    );
  });

  it('falls back through persisted and browser language preferences', () => {
    expect(resolveUiLocale(undefined, 'en', 'zh-CN')).toBe('en');
    expect(resolveUiLocale(undefined, undefined, 'zh-Hans')).toBe('zh-CN');
    expect(resolveUiLocale(undefined, undefined, 'fr-FR')).toBe('en');
  });
});
