export type ExtensionLocale = 'en' | 'zh-CN';

const english = {
  nodes: '{count} nodes',
  invalidNarrative: 'Invalid project narrative',
  openOutput: 'Open Output for details',
  openSource: 'Open source',
  openWeb: 'Open full Web overview',
  details: 'Details',
  overview: 'Overview',
  functionFlow: 'Function flow',
  implementation: 'Implementation',
  from: 'From',
  to: 'To',
  flowEntry: 'Flow entry',
  flowEnd: 'Flow end',
  source: 'Source',
  loading: 'Loading the function narrative…',
  noNarrative: 'This node is not bound to a narrated function yet.',
  noDetails: 'No implementation details are attached to this function.',
  coveredStatements: '{count} covered statements',
  noManifest: 'Add .shishan/project.json to show project narrative nodes here.',
  refresh: 'Refresh',
  checkPassed: 'ShiShan narrative check passed.',
  checkFailed: 'ShiShan narrative check failed. See the ShiShan output channel.',
  openWorkspace: 'Open a workspace folder before using ShiShan.',
  cliMissing: 'ShiShan CLI was not found. Build this repository or set shishan.cliPath.',
  unsafeSource: 'ShiShan rejected this source because it is outside the workspace or no longer exists.',
  kindEntry: 'Entry',
  kindModule: 'Module',
  kindProcess: 'Process',
  kindDecision: 'Decision',
  kindError: 'Error path',
  kindOutput: 'Output',
  kindExternal: 'External system',
  narrativeFunction: 'Function',
  narrativeStep: 'Step',
  narrativeBranch: 'Decision',
  narrativeLoop: 'Loop',
  narrativeCall: 'Call',
  narrativeError: 'Error boundary',
  narrativeAsync: 'Async wait',
  edgeYes: 'Yes',
  edgeNo: 'No',
  edgeCalls: 'Calls',
  edgeFailure: 'Failure',
  edgeData: 'Data',
  edgeNext: 'Next'
} as const;

export type ExtensionMessageKey = keyof typeof english;
type Values = Readonly<Record<string, string | number>>;

const chinese: Record<ExtensionMessageKey, string> = {
  nodes: '{count} 个节点',
  invalidNarrative: '项目叙事无效',
  openOutput: '请打开输出面板查看详情',
  openSource: '打开源码',
  openWeb: '打开完整网页总览',
  details: '查看详情',
  overview: '概览',
  functionFlow: '函数流程',
  implementation: '实现细节',
  from: '来自',
  to: '前往',
  flowEntry: '流程入口',
  flowEnd: '流程终点',
  source: '源码',
  loading: '正在加载函数叙事…',
  noNarrative: '这个节点尚未绑定到带叙事的函数。',
  noDetails: '这个函数暂时没有实现细节说明。',
  coveredStatements: '覆盖 {count} 条语句',
  noManifest: '添加 .shishan/project.json 后，项目叙事节点会显示在这里。',
  refresh: '刷新',
  checkPassed: 'ShiShan 叙事检查通过。',
  checkFailed: 'ShiShan 叙事检查失败，请查看 ShiShan 输出面板。',
  openWorkspace: '请先打开一个工作区文件夹再使用 ShiShan。',
  cliMissing: '未找到 ShiShan CLI；请构建本仓库或设置 shishan.cliPath。',
  unsafeSource: '该源码位于工作区外或已不存在，ShiShan 已拒绝打开。',
  kindEntry: '入口',
  kindModule: '模块',
  kindProcess: '处理',
  kindDecision: '判断',
  kindError: '错误路径',
  kindOutput: '输出',
  kindExternal: '外部系统',
  narrativeFunction: '函数',
  narrativeStep: '步骤',
  narrativeBranch: '判断',
  narrativeLoop: '循环',
  narrativeCall: '调用',
  narrativeError: '错误边界',
  narrativeAsync: '异步等待',
  edgeYes: '是',
  edgeNo: '否',
  edgeCalls: '调用',
  edgeFailure: '失败',
  edgeData: '数据',
  edgeNext: '下一步'
};

export function resolveExtensionLocale(
  configured: string | undefined,
  vscodeLanguage: string | undefined
): ExtensionLocale {
  const candidate =
    configured && configured !== 'auto' ? configured : vscodeLanguage ?? 'en';
  return candidate.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function extensionText(
  locale: ExtensionLocale,
  key: ExtensionMessageKey,
  values: Values = {}
): string {
  const template = locale === 'zh-CN' ? chinese[key] : english[key];
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match
  );
}

export function extensionMessages(
  locale: ExtensionLocale
): Record<ExtensionMessageKey, string> {
  return Object.fromEntries(
    (Object.keys(english) as ExtensionMessageKey[]).map((key) => [
      key,
      extensionText(locale, key)
    ])
  ) as Record<ExtensionMessageKey, string>;
}
