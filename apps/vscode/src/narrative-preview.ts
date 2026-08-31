import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  extensionMessages,
  type ExtensionLocale
} from './i18n.js';
import type {
  ProjectManifest,
  ProjectManifestNode,
  ProjectManifestParseResult
} from './project-manifest.js';
import type {
  PreviewNodeDrilldown,
  PreviewSourceRange
} from './preview-model.js';

interface NarrativePreviewCallbacks {
  locale(): ExtensionLocale;
  readManifest(): Promise<ProjectManifestParseResult>;
  loadNodeDetails(flowId: string, nodeId: string): Promise<PreviewNodeDrilldown>;
  openSource(node: ProjectManifestNode): Promise<void>;
  openRange(range: PreviewSourceRange): Promise<void>;
  openWeb(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function messageText(value: unknown, key: string): string | undefined {
  const message = record(value);
  const candidate = message?.[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}

export class NarrativePreviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  #view: vscode.WebviewView | undefined;
  #manifest: ProjectManifest | undefined;
  #details = new Map<string, PreviewNodeDrilldown>();
  #loading = new Map<string, Promise<PreviewNodeDrilldown>>();
  #disposables: vscode.Disposable[] = [];

  constructor(private readonly callbacks: NarrativePreviewCallbacks) {}

  // @shishan function resolve-narrative-preview
  // @summary Initialize the sandboxed VS Code Webview and connect its bounded messages
  // @input Webview View supplied by VS Code
  // @output live project narrative card view
  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.#view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(this.callbacks.locale());
    this.#disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      }),
      view.onDidDispose(() => {
        if (this.#view === view) {
          this.#view = undefined;
        }
      })
    );
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.#details.clear();
    this.#loading.clear();
    const result = await this.callbacks.readManifest();
    this.#manifest = result.manifest;
    await this.#view?.webview.postMessage({
      type: 'state',
      manifest: result.manifest,
      error: result.error
    });
  }

  async refreshLocale(): Promise<void> {
    if (!this.#view) {
      return;
    }
    this.#view.webview.html = this.html(this.callbacks.locale());
    await this.refresh();
  }

  dispose(): void {
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
    this.#disposables = [];
    this.#view = undefined;
  }

  private node(flowId: string, nodeId: string): ProjectManifestNode | undefined {
    return this.#manifest?.flows
      .find((flow) => flow.id === flowId)
      ?.nodes.find((node) => node.id === nodeId);
  }

  private async handleMessage(value: unknown): Promise<void> {
    const type = messageText(value, 'type');
    if (type === 'refresh') {
      await this.refresh();
      return;
    }
    if (type === 'openWeb') {
      await this.callbacks.openWeb();
      return;
    }

    const flowId = messageText(value, 'flowId');
    const nodeId = messageText(value, 'nodeId');
    if (!flowId || !nodeId || !this.node(flowId, nodeId)) {
      return;
    }
    if (type === 'openSource') {
      const node = this.node(flowId, nodeId);
      if (node?.source) {
        await this.callbacks.openSource(node);
      }
      return;
    }
    if (type === 'loadDetails') {
      await this.loadDetails(flowId, nodeId);
      return;
    }
    if (type === 'openDetailSource') {
      const category = messageText(value, 'category');
      const itemId = messageText(value, 'itemId');
      const model = this.#details.get(flowId + ':' + nodeId);
      const item =
        category === 'outline'
          ? model?.outline.find((candidate) => candidate.id === itemId)
          : category === 'detail'
            ? model?.details.find((candidate) => candidate.id === itemId)
            : undefined;
      if (item?.source) {
        await this.callbacks.openRange(item.source);
      }
    }
  }

  private async loadDetails(flowId: string, nodeId: string): Promise<void> {
    const key = flowId + ':' + nodeId;
    const cached = this.#details.get(key);
    if (cached) {
      await this.#view?.webview.postMessage({
        type: 'details',
        flowId,
        nodeId,
        model: cached
      });
      return;
    }
    let request = this.#loading.get(key);
    if (!request) {
      request = this.callbacks.loadNodeDetails(flowId, nodeId);
      this.#loading.set(key, request);
    }
    try {
      const model = await request;
      this.#details.set(key, model);
      await this.#view?.webview.postMessage({
        type: 'details',
        flowId,
        nodeId,
        model
      });
    } catch (error) {
      await this.#view?.webview.postMessage({
        type: 'detailsError',
        flowId,
        nodeId,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.#loading.delete(key);
    }
  }

  private html(locale: ExtensionLocale): string {
    const nonce = randomBytes(18).toString('base64');
    const strings = JSON.stringify(extensionMessages(locale)).replace(
      /</g,
      '\\u003c'
    );
    return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 10px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 12px; }
    button, select { color: inherit; font: inherit; }
    button:focus-visible, select:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .project { display: grid; gap: 9px; margin-bottom: 13px; padding: 3px 2px; }
    .project h1 { margin: 0; font-size: 15px; line-height: 1.25; }
    .project p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .toolbar { display: flex; gap: 6px; }
    .toolbar button, .source-button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 5px; background: var(--vscode-button-secondaryBackground); padding: 5px 7px; color: var(--vscode-button-secondaryForeground); cursor: pointer; }
    .toolbar button:first-child { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .flow-select { width: 100%; margin-bottom: 10px; border: 1px solid var(--vscode-dropdown-border); border-radius: 5px; background: var(--vscode-dropdown-background); padding: 6px 8px; color: var(--vscode-dropdown-foreground); }
    .flow-heading { margin: 3px 2px 12px; }
    .flow-heading strong { display: block; font-size: 13px; }
    .flow-heading span { display: block; margin-top: 4px; color: var(--vscode-descriptionForeground); line-height: 1.4; }
    .node-list { display: grid; gap: 13px; }
    .node-wrap { position: relative; }
    .node-wrap:not(:last-child)::after { position: absolute; z-index: 0; top: calc(100% + 1px); left: 18px; width: 1px; height: 12px; background: var(--vscode-tree-indentGuidesStroke); content: ""; }
    .node-card { position: relative; z-index: 1; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-left: 4px solid var(--node-accent, var(--vscode-charts-green)); border-radius: 8px; background: var(--vscode-editor-background); }
    .node-card[open] { border-color: var(--vscode-focusBorder); }
    .node-card summary { display: grid; gap: 5px; padding: 10px; cursor: pointer; list-style: none; }
    .node-card summary::-webkit-details-marker { display: none; }
    .kicker { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--vscode-descriptionForeground); font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .node-card h2 { margin: 0; font-size: 13px; line-height: 1.3; }
    .node-card summary p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
    .node-card[open] summary p { -webkit-line-clamp: unset; }
    .chevron { transition: transform .15s ease; }
    .node-card[open] .chevron { transform: rotate(90deg); }
    .node-panel { border-top: 1px solid var(--vscode-panel-border); padding: 8px; }
    .levels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; margin-bottom: 9px; border-radius: 6px; background: var(--vscode-editorWidget-background); padding: 2px; }
    .levels button { min-width: 0; overflow: hidden; border: 0; border-radius: 4px; background: transparent; padding: 5px 2px; cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
    .levels button.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .level-content { display: grid; gap: 7px; }
    .relation { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 6px; font-size: 10px; }
    .relation > span:first-child { color: var(--vscode-descriptionForeground); }
    .relation-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .relation-tags span { border-radius: 4px; background: var(--vscode-badge-background); padding: 2px 4px; color: var(--vscode-badge-foreground); }
    .source-path { overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 10px; }
    .item-list { display: grid; gap: 5px; }
    .item { display: grid; width: 100%; gap: 3px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); padding: 7px; cursor: pointer; text-align: left; }
    .item:hover { background: var(--vscode-list-hoverBackground); }
    .item-kind { color: var(--vscode-descriptionForeground); font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item small { color: var(--vscode-descriptionForeground); line-height: 1.4; }
    .message { margin: 3px 0; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.45; }
    .error { color: var(--vscode-errorForeground); }
    .empty { display: grid; place-items: center; min-height: 130px; padding: 20px 8px; text-align: center; }
    .empty p { color: var(--vscode-descriptionForeground); line-height: 1.5; }
  </style>
</head>
<body>
  <main id="root" aria-live="polite"></main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const strings = ${strings};
    const root = document.getElementById('root');
    let manifest;
    let stateError = '';
    let activeFlowId = '';
    const openNodes = new Set();
    const levels = new Map();
    const detailModels = new Map();
    const detailErrors = new Map();
    const requested = new Set();

    function format(template, values = {}) {
      return template.replace(/\\{([a-zA-Z]+)\\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
      );
    }
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function action(label, type, payload = {}) {
      const button = element('button', '', label);
      button.type = 'button';
      button.addEventListener('click', () => vscode.postMessage({ type, ...payload }));
      return button;
    }
    function kindLabel(kind) {
      const key = {
        entry: 'kindEntry', module: 'kindModule', process: 'kindProcess',
        decision: 'kindDecision', error: 'kindError', output: 'kindOutput',
        external: 'kindExternal', function: 'narrativeFunction', step: 'narrativeStep',
        branch: 'narrativeBranch', loop: 'narrativeLoop', call: 'narrativeCall',
        async: 'narrativeAsync'
      }[kind];
      return key ? strings[key] : kind;
    }
    function edgeLabel(edge) {
      if (edge.label) return edge.label;
      const key = { true: 'edgeYes', false: 'edgeNo', calls: 'edgeCalls', error: 'edgeFailure', data: 'edgeData', next: 'edgeNext' }[edge.kind];
      return key ? strings[key] : edge.kind;
    }
    function requestDetails(flowId, nodeId) {
      const key = flowId + ':' + nodeId;
      if (requested.has(key) || detailModels.has(key)) return;
      requested.add(key);
      vscode.postMessage({ type: 'loadDetails', flowId, nodeId });
    }
    function relation(label, edges, flow, end) {
      const row = element('div', 'relation');
      row.append(element('span', '', label));
      const tags = element('div', 'relation-tags');
      if (edges.length === 0) {
        tags.append(element('span', '', end));
      } else {
        for (const edge of edges) {
          const relatedId = label === strings.from ? edge.source : edge.target;
          const related = flow.nodes.find((candidate) => candidate.id === relatedId);
          tags.append(element('span', '', (related ? related.label : relatedId) + ' · ' + edgeLabel(edge)));
        }
      }
      row.append(tags);
      return row;
    }
    function overviewLevel(flow, node) {
      const content = element('div', 'level-content');
      const incoming = flow.edges.filter((edge) => edge.target === node.id);
      const outgoing = flow.edges.filter((edge) => edge.source === node.id);
      content.append(
        relation(strings.from, incoming, flow, strings.flowEntry),
        relation(strings.to, outgoing, flow, strings.flowEnd)
      );
      if (node.source) {
        const source = element('div', 'source-path', node.source.path + (node.source.symbol ? ' · ' + node.source.symbol : ''));
        content.append(source, action(strings.openSource, 'openSource', { flowId: flow.id, nodeId: node.id }));
      }
      return content;
    }
    function drilldownLevel(flow, node, level) {
      const key = flow.id + ':' + node.id;
      const content = element('div', 'level-content');
      const error = detailErrors.get(key);
      if (error) {
        content.append(element('p', 'message error', error));
        return content;
      }
      const model = detailModels.get(key);
      if (!model) {
        content.append(element('p', 'message', node.source ? strings.loading : strings.noNarrative));
        if (node.source) requestDetails(flow.id, node.id);
        return content;
      }
      if (!model.narrativeFound) {
        content.append(element('p', 'message', strings.noNarrative));
        return content;
      }
      const items = level === 'flow' ? model.outline : model.details;
      if (items.length === 0) {
        content.append(element('p', 'message', strings.noDetails));
        return content;
      }
      const list = element('div', 'item-list');
      for (const item of items) {
        const button = element('button', 'item');
        button.type = 'button';
        if (level === 'flow') button.style.marginLeft = Math.min(item.depth, 6) * 7 + 'px';
        button.append(
          element('span', 'item-kind', level === 'flow' ? kindLabel(item.kind) : item.parentLabel),
          element('strong', '', level === 'flow' ? item.label : item.summary),
          element('small', '', level === 'flow' ? item.summary : format(strings.coveredStatements, { count: item.coveredStatements }))
        );
        button.disabled = !item.source;
        if (item.source) {
          button.addEventListener('click', () => vscode.postMessage({
            type: 'openDetailSource', flowId: flow.id, nodeId: node.id,
            category: level === 'flow' ? 'outline' : 'detail', itemId: item.id
          }));
        }
        list.append(button);
      }
      content.append(list);
      return content;
    }
    function nodePanel(flow, node) {
      const panel = element('div', 'node-panel');
      const selected = levels.get(flow.id + ':' + node.id) || 'overview';
      const tabs = element('div', 'levels');
      const choices = [
        ['overview', strings.overview],
        ['flow', strings.functionFlow],
        ['implementation', strings.implementation]
      ];
      for (const [value, label] of choices) {
        const button = element('button', value === selected ? 'active' : '', label);
        button.type = 'button';
        button.addEventListener('click', () => {
          levels.set(flow.id + ':' + node.id, value);
          if (value !== 'overview') requestDetails(flow.id, node.id);
          render();
        });
        tabs.append(button);
      }
      panel.append(tabs, selected === 'overview' ? overviewLevel(flow, node) : drilldownLevel(flow, node, selected));
      return panel;
    }
    function nodeCard(flow, node) {
      const wrap = element('div', 'node-wrap');
      const card = element('details', 'node-card');
      const key = flow.id + ':' + node.id;
      card.style.setProperty('--node-accent', {
        entry: 'var(--vscode-charts-green)', decision: 'var(--vscode-charts-yellow)',
        error: 'var(--vscode-charts-red)', output: 'var(--vscode-charts-blue)',
        external: 'var(--vscode-charts-purple)'
      }[node.kind] || 'var(--vscode-charts-green)');
      card.open = openNodes.has(key);
      const summary = document.createElement('summary');
      const kicker = element('div', 'kicker');
      kicker.append(element('span', '', kindLabel(node.kind)), element('span', 'chevron', '›'));
      summary.append(kicker, element('h2', '', node.label), element('p', '', node.summary));
      card.append(summary);
      if (card.open) card.append(nodePanel(flow, node));
      card.addEventListener('toggle', () => {
        if (card.open) {
          openNodes.add(key);
          if (node.source) requestDetails(flow.id, node.id);
          if (!card.querySelector('.node-panel')) card.append(nodePanel(flow, node));
        } else {
          openNodes.delete(key);
          card.querySelector('.node-panel')?.remove();
        }
      });
      wrap.append(card);
      return wrap;
    }
    function render() {
      root.replaceChildren();
      if (!manifest) {
        const empty = element('section', 'empty');
        empty.append(element('p', stateError ? 'error' : '', stateError || strings.noManifest), action(strings.refresh, 'refresh'));
        root.append(empty);
        return;
      }
      const project = element('header', 'project');
      project.append(element('h1', '', manifest.title), element('p', '', manifest.summary));
      const toolbar = element('div', 'toolbar');
      toolbar.append(action(strings.openWeb, 'openWeb'), action(strings.refresh, 'refresh'));
      project.append(toolbar);
      root.append(project);
      if (!activeFlowId || !manifest.flows.some((flow) => flow.id === activeFlowId)) {
        activeFlowId = manifest.entryFlow || manifest.flows[0].id;
      }
      if (manifest.flows.length > 1) {
        const select = element('select', 'flow-select');
        select.setAttribute('aria-label', strings.overview);
        for (const flow of manifest.flows) {
          const option = element('option', '', flow.title);
          option.value = flow.id;
          option.selected = flow.id === activeFlowId;
          select.append(option);
        }
        select.addEventListener('change', () => { activeFlowId = select.value; render(); });
        root.append(select);
      }
      const flow = manifest.flows.find((candidate) => candidate.id === activeFlowId) || manifest.flows[0];
      const heading = element('div', 'flow-heading');
      heading.append(element('strong', '', flow.title), element('span', '', flow.summary));
      root.append(heading);
      const list = element('section', 'node-list');
      flow.nodes.forEach((node) => list.append(nodeCard(flow, node)));
      root.append(list);
    }
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'state') {
        manifest = message.manifest;
        stateError = typeof message.error === 'string' ? message.error : '';
        render();
      } else if (message.type === 'details' && typeof message.flowId === 'string' && typeof message.nodeId === 'string') {
        const key = message.flowId + ':' + message.nodeId;
        requested.delete(key);
        detailErrors.delete(key);
        detailModels.set(key, message.model);
        render();
      } else if (message.type === 'detailsError' && typeof message.flowId === 'string' && typeof message.nodeId === 'string') {
        const key = message.flowId + ':' + message.nodeId;
        requested.delete(key);
        detailErrors.set(key, String(message.error || 'Unknown error'));
        render();
      }
    });
  </script>
</body>
</html>`;
  }
}
