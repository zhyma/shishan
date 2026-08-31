import { describe, expect, it } from 'vitest';
import { extensionText, resolveExtensionLocale } from './i18n.js';

describe('VS Code locale selection', () => {
  it('uses an explicit setting before the editor locale', () => {
    expect(resolveExtensionLocale('en', 'zh-cn')).toBe('en');
    expect(resolveExtensionLocale('zh-cn', 'en')).toBe('zh-CN');
  });

  it('follows Chinese editor variants in auto mode', () => {
    expect(resolveExtensionLocale('auto', 'zh-tw')).toBe('zh-CN');
    expect(extensionText('zh-CN', 'nodes', { count: 3 })).toBe('3 个节点');
  });
});
