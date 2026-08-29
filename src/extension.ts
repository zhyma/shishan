import * as vscode from 'vscode';
import { computeFoldingRanges } from './folding';

/** 本会话中已经自动折叠过一次的文件（避免来回切换标签页时反复执行） */
const autoApplied = new Set<string>();
/** 当前处于骨架折叠状态的文件 */
const skeletonActive = new Set<string>();

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'pythonSkeleton.toggle';
  statusBar.tooltip = 'Python 骨架视图：点击切换“折叠全部 / 展开全部”';
  context.subscriptions.push(statusBar);

  // 折叠范围提供器：把 import 和代码切成折叠段，
  // 折叠后只剩注释行与 def/class 行，注释行下方就是可点击的小三角。
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'python' },
      {
        provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
          const cfg = vscode.workspace.getConfiguration('pythonSkeleton');
          const showClassLines = cfg.get<boolean>('showClassLines', true);
          return computeFoldingRanges(document.getText().split(/\r?\n/), { showClassLines }).map(
            (r) => new vscode.FoldingRange(r.start, r.end)
          );
        },
      }
    )
  );

  const updateStatusBar = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'python') {
      const key = editor.document.uri.toString();
      statusBar.text = skeletonActive.has(key)
        ? '$(chevron-down) 骨架视图'
        : '$(chevron-right) 骨架视图';
      statusBar.show();
    } else {
      statusBar.hide();
    }
  };

  const doFold = async (fold: boolean): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const key = editor.document.uri.toString();
    if (fold) {
      await vscode.commands.executeCommand('editor.foldAll');
      skeletonActive.add(key);
    } else {
      await vscode.commands.executeCommand('editor.unfoldAll');
      skeletonActive.delete(key);
    }
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('pythonSkeleton.enable', () => doFold(true)),
    vscode.commands.registerCommand('pythonSkeleton.disable', () => doFold(false)),
    vscode.commands.registerCommand('pythonSkeleton.toggle', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      await doFold(!skeletonActive.has(editor.document.uri.toString()));
    })
  );

  // 自动折叠：Python 文件打开/激活后自动执行一次 foldAll
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleAutoFold = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'python') {
        return;
      }
      const key = editor.document.uri.toString();
      const cfg = vscode.workspace.getConfiguration('pythonSkeleton');
      if (!cfg.get<boolean>('autoFoldOnOpen', true) || autoApplied.has(key)) {
        return;
      }
      autoApplied.add(key);
      void vscode.commands.executeCommand('editor.foldAll').then(() => {
        skeletonActive.add(key);
        updateStatusBar();
      });
    }, 250);
  };

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(scheduleAutoFold));

  if (vscode.window.activeTextEditor?.document.languageId === 'python') {
    setTimeout(scheduleAutoFold, 400);
  }
  updateStatusBar();
}

export function deactivate(): void {}
