import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type UiLocale = 'en' | 'zh-CN';

const english = {
  'brand.tagline': 'Code narrative',
  'language.label': 'Interface language',
  'language.en': 'EN',
  'language.zh': '中文',
  'nav.level': 'Narrative level',
  'nav.overview': 'Overview',
  'nav.functions': 'Functions',
  'stats.flows': 'Project flows',
  'stats.coverage': 'Coverage',
  'stats.functions': 'Functions',
  'stats.diagnostics': 'Diagnostics',
  'stats.freshness': 'Freshness',
  'status.stale': '{count} stale',
  'status.staleOne': 'stale',
  'status.static': 'Static',
  'status.live': 'Live',
  'status.reconnecting': 'Reconnecting',
  'loading.index': 'Reading the local narrative index…',
  'sidebar.explore': 'Explore',
  'sidebar.overall': 'Overall narrative',
  'sidebar.narratedFiles': '{count} narrated files',
  'sidebar.filterAria': 'Filter files and functions',
  'sidebar.filterPlaceholder': 'Filter files or functions',
  'diagnostics.title': 'Diagnostics',
  'diagnostics.empty': 'No diagnostics in the current index.',
  'project.story': 'Project story',
  'project.namedFlows': 'Named flows',
  'project.nodes': '{count} nodes',
  'project.chooseFlow': 'Choose project flow',
  'project.manifestMissing': 'Manifest missing',
  'project.noStory': 'No overall story yet',
  'project.manifestHelp':
    'Add .shishan/project.json to name the project’s important flows. The function index remains available in the Functions tab.',
  'functions.none': 'No narrated functions',
  'functions.noMatch': 'No files match “{filter}”.',
  'functions.showingFirst':
    'Showing the first {shown} files. Use the filter to narrow {total} matches.',
  'update.last': 'Last update {summary}',
  'update.reused': 'reused cached files',
  'update.initial': 'initial snapshot · {count} {unit}',
  'update.file': 'file',
  'update.files': 'files',
  'update.more': '{paths} +{count} more',
  'flow.overall': 'Overall narrative · {id}',
  'flow.narrativeNodes': '{count} narrative nodes',
  'flow.hideSource': 'Hide source',
  'flow.noProject': 'No project narrative yet',
  'flow.noProjectHelp':
    'Define the few flows people need to understand in .shishan/project.json. ShiShan will validate and bind its nodes to real source symbols.',
  'flow.noFunctions': 'No narrated functions yet',
  'flow.noFunctionsHelp':
    'Add a @shishan function block and the live index will place it here.',
  'flow.viewFunctionSource': 'View function source',
  'node.details': 'Details',
  'node.functionStory': 'Function story →',
  'node.source': 'Source',
  'node.kind.entry': 'Entry',
  'node.kind.module': 'Module',
  'node.kind.process': 'Process',
  'node.kind.decision': 'Decision',
  'node.kind.error': 'Error path',
  'node.kind.output': 'Output',
  'node.kind.external': 'External system',
  'narrative.kind.function': 'Function',
  'narrative.kind.step': 'Step',
  'narrative.kind.branch': 'Decision',
  'narrative.kind.loop': 'Loop',
  'narrative.kind.call': 'Call',
  'narrative.kind.error': 'Error boundary',
  'narrative.kind.async': 'Async wait',
  'edge.yes': 'Yes',
  'edge.no': 'No',
  'edge.otherwise': 'Otherwise',
  'edge.calls': 'Calls',
  'edge.failure': 'Failure',
  'edge.data': 'Data',
  'edge.repeat': 'Repeat',
  'edge.continue': 'Continue',
  'field.condition': 'If',
  'field.target': 'Calls',
  'field.failure': 'Failure',
  'field.resume': 'Resume',
  'field.input': 'Input',
  'field.output': 'Output',
  'field.effect': 'Effect',
  'field.note': 'Note',
  'details.note': 'implementation note',
  'details.notes': 'implementation notes',
  'details.none': 'No implementation details are attached to this function.',
  'details.coveredStatements': '{count} covered statements',
  'summary.missing': 'No summary provided.',
  'inspector.close': 'Close node details',
  'inspector.title': 'Node details',
  'inspector.level': 'Display level',
  'inspector.overview': 'Overview',
  'inspector.flow': 'Function flow',
  'inspector.implementation': 'Implementation',
  'inspector.boundSource': 'Bound source',
  'inspector.relationships': 'Flow relationships',
  'inspector.incoming': 'From',
  'inspector.outgoing': 'To',
  'inspector.noIncoming': 'Entry of this named flow',
  'inspector.noOutgoing': 'End of this named flow',
  'inspector.noFunction':
    'This project node is not bound to a narrated function yet.',
  'inspector.openSource': 'Open source',
  'inspector.openFunction': 'Open full function graph',
  'inspector.flowNodes': '{count} function narrative nodes',
  'source.empty': 'Select a narrative node to inspect its source.',
  'source.notIncluded':
    'Source was not included in this static export. Re-export with --include-source to enable source navigation.',
  'source.loadFailed': 'Could not load source ({status}).',
  'source.title': 'Source',
  'source.openVsCode': 'Open in VS Code',
  'source.loading': 'Loading source…',
  'source.limit': 'Showing the first {count} lines of this range.',
  'graph.optimizing': 'Optimizing large graph layout…',
  'graph.fallback': 'ELK timed out; using safe fallback layout.',
  'graph.truncated': 'Showing the first {count} narrative nodes.'
} as const;

export type MessageKey = keyof typeof english;
export type MessageValues = Readonly<Record<string, string | number>>;

const chinese: Record<MessageKey, string> = {
  'brand.tagline': '代码叙事',
  'language.label': '界面语言',
  'language.en': 'EN',
  'language.zh': '中文',
  'nav.level': '叙事层级',
  'nav.overview': '总览',
  'nav.functions': '函数',
  'stats.flows': '项目流程',
  'stats.coverage': '覆盖率',
  'stats.functions': '函数',
  'stats.diagnostics': '诊断',
  'stats.freshness': '新鲜度',
  'status.stale': '{count} 个过期',
  'status.staleOne': '已过期',
  'status.static': '静态',
  'status.live': '实时',
  'status.reconnecting': '重连中',
  'loading.index': '正在读取本地叙事索引…',
  'sidebar.explore': '浏览',
  'sidebar.overall': '整体叙事',
  'sidebar.narratedFiles': '{count} 个有叙事的文件',
  'sidebar.filterAria': '筛选文件和函数',
  'sidebar.filterPlaceholder': '筛选文件或函数',
  'diagnostics.title': '诊断',
  'diagnostics.empty': '当前索引没有诊断项。',
  'project.story': '项目叙事',
  'project.namedFlows': '命名流程',
  'project.nodes': '{count} 个节点',
  'project.chooseFlow': '选择项目流程',
  'project.manifestMissing': '缺少项目清单',
  'project.noStory': '还没有整体叙事',
  'project.manifestHelp':
    '在 .shishan/project.json 中命名项目的重要流程；函数索引仍可在“函数”页查看。',
  'functions.none': '没有带叙事的函数',
  'functions.noMatch': '没有文件匹配“{filter}”。',
  'functions.showingFirst':
    '当前显示前 {shown} 个文件，请使用筛选缩小 {total} 个匹配项。',
  'update.last': '最近更新：{summary}',
  'update.reused': '复用缓存文件',
  'update.initial': '初始快照 · {count} 个{unit}',
  'update.file': '文件',
  'update.files': '文件',
  'update.more': '{paths}，另有 {count} 个',
  'flow.overall': '整体叙事 · {id}',
  'flow.narrativeNodes': '{count} 个叙事节点',
  'flow.hideSource': '隐藏源码',
  'flow.noProject': '还没有项目叙事',
  'flow.noProjectHelp':
    '在 .shishan/project.json 中定义读者真正需要理解的少量流程；ShiShan 会校验节点并绑定真实源码符号。',
  'flow.noFunctions': '还没有函数叙事',
  'flow.noFunctionsHelp': '添加 @shishan function 注释后，实时索引会在这里展示。',
  'flow.viewFunctionSource': '查看函数源码',
  'node.details': '查看详情',
  'node.functionStory': '函数叙事 →',
  'node.source': '源码',
  'node.kind.entry': '入口',
  'node.kind.module': '模块',
  'node.kind.process': '处理',
  'node.kind.decision': '判断',
  'node.kind.error': '错误路径',
  'node.kind.output': '输出',
  'node.kind.external': '外部系统',
  'narrative.kind.function': '函数',
  'narrative.kind.step': '步骤',
  'narrative.kind.branch': '判断',
  'narrative.kind.loop': '循环',
  'narrative.kind.call': '调用',
  'narrative.kind.error': '错误边界',
  'narrative.kind.async': '异步等待',
  'edge.yes': '是',
  'edge.no': '否',
  'edge.otherwise': '否则',
  'edge.calls': '调用',
  'edge.failure': '失败',
  'edge.data': '数据',
  'edge.repeat': '重复',
  'edge.continue': '继续',
  'field.condition': '条件',
  'field.target': '调用',
  'field.failure': '失败',
  'field.resume': '恢复后',
  'field.input': '输入',
  'field.output': '输出',
  'field.effect': '影响',
  'field.note': '备注',
  'details.note': '条实现说明',
  'details.notes': '条实现说明',
  'details.none': '这个函数暂时没有绑定实现细节说明。',
  'details.coveredStatements': '覆盖 {count} 条语句',
  'summary.missing': '未提供摘要。',
  'inspector.close': '关闭节点详情',
  'inspector.title': '节点详情',
  'inspector.level': '显示层级',
  'inspector.overview': '概览',
  'inspector.flow': '函数流程',
  'inspector.implementation': '实现细节',
  'inspector.boundSource': '绑定源码',
  'inspector.relationships': '流程关系',
  'inspector.incoming': '来自',
  'inspector.outgoing': '前往',
  'inspector.noIncoming': '这是命名流程的入口',
  'inspector.noOutgoing': '这是命名流程的终点',
  'inspector.noFunction': '这个项目节点尚未绑定到带叙事的函数。',
  'inspector.openSource': '打开源码',
  'inspector.openFunction': '打开完整函数图',
  'inspector.flowNodes': '{count} 个函数叙事节点',
  'source.empty': '请选择一个叙事节点查看源码。',
  'source.notIncluded':
    '这个静态导出没有包含源码；请使用 --include-source 重新导出以启用源码导航。',
  'source.loadFailed': '无法加载源码（{status}）。',
  'source.title': '源码',
  'source.openVsCode': '在 VS Code 中打开',
  'source.loading': '正在加载源码…',
  'source.limit': '当前只显示这个范围的前 {count} 行。',
  'graph.optimizing': '正在优化大型流程图布局…',
  'graph.fallback': 'ELK 布局超时，已使用安全回退布局。',
  'graph.truncated': '当前显示前 {count} 个叙事节点。'
};

export function translate(
  locale: UiLocale,
  key: MessageKey,
  values: MessageValues = {}
): string {
  const template = locale === 'zh-CN' ? chinese[key] : english[key];
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match
  );
}

export function resolveUiLocale(
  requested?: string | null,
  stored?: string | null,
  browserLanguage?: string | null
): UiLocale {
  for (const candidate of [requested, stored, browserLanguage]) {
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    if (normalized === 'zh' || normalized.startsWith('zh-')) {
      return 'zh-CN';
    }
    if (normalized === 'en' || normalized.startsWith('en-')) {
      return 'en';
    }
  }
  return 'en';
}

interface I18nContextValue {
  locale: UiLocale;
  t(key: MessageKey, values?: MessageValues): string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: (key, values) => translate('en', key, values)
});

export function I18nProvider({
  locale,
  children
}: {
  locale: UiLocale;
  children: ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key, values) => translate(locale, key, values)
    }),
    [locale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
