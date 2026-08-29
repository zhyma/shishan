/**
 * 计算“骨架折叠”范围：
 * - 可见行：整行注释、def/class 行（含 async def）、三引号字符串（文档注释）整体
 * - 其余代码行被切分成若干段，每段生成一个折叠范围
 * - 折叠范围尽量锚定在可见行上：
 *   * 代码段前面是注释 → 小三角标在最后一条注释行，点击展开其下方的代码
 *   * 代码段前面是 def/class → 小三角标在函数名/类名行
 * - 段间分隔的空白行折叠后只保留一行；文件末尾的空白行全部收进折叠区。
 *   Only one separator blank line stays visible between folded sections;
 *   blank lines at the end of the file are folded away.
 */
export interface FoldRangeLike {
  start: number;
  end: number;
}

export interface FoldingOptions {
  showClassLines: boolean;
}

const COMMENT_RE = /^\s*#/;
const DEF_RE = /^\s*(?:async\s+)?def\s+/;
const CLASS_RE = /^\s*class\s+/;
const BLANK_RE = /^\s*$/;
const TRIPLE_RE = /("""|''')/g;

interface LineInfo {
  visible: boolean;
}

function isHeader(line: string, showClassLines: boolean): boolean {
  return DEF_RE.test(line) || (showClassLines && CLASS_RE.test(line));
}

export function computeFoldingRanges(lines: string[], options: FoldingOptions): FoldRangeLike[] {
  const info: LineInfo[] = [];
  let inString = false;
  for (const line of lines) {
    const wasInString = inString;
    inString = updateStringState(line, inString);
    // 三引号多行字符串（文档注释）整体保持可见，折叠时完整显示而不是只留第一行。
    // Multi-line triple-quoted strings (docstrings) stay fully visible when folded.
    const inStrLine = wasInString || inString;
    const header = !inStrLine && isHeader(line, options.showClassLines);
    const visible = header || (!inStrLine && COMMENT_RE.test(line)) || inStrLine;
    info.push({ visible });
  }

  const ranges: FoldRangeLike[] = [];
  let i = 0;
  while (i < lines.length) {
    if (info[i].visible) {
      i += 1;
      continue;
    }

    let j = i;
    while (j < lines.length && !info[j].visible) {
      j += 1;
    }
    const start = i;
    let end = j - 1;
    i = j;

    // 段与段之间的分隔空白行只保留一行，多出的收进上一段折叠区；
    // 文件末尾的空白行全部收进折叠区，避免骨架视图尾部悬空。
    // Keep at most one separator blank line visible between sections, and fold
    // away all trailing blank lines at the end of the file.
    let lastNonBlank = end;
    while (lastNonBlank >= start && BLANK_RE.test(lines[lastNonBlank])) {
      lastNonBlank -= 1;
    }
    if (lastNonBlank >= start) {
      if (j < lines.length && lastNonBlank < end) {
        end -= 1;
      }
    } else {
      end = lastNonBlank;
    }

    // 全是空白行的段落不折叠
    let hasContent = false;
    for (let k = start; k <= end; k += 1) {
      if (!BLANK_RE.test(lines[k])) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) {
      continue;
    }

    let foldStart = -1;
    // 向前跨过空白行，把折叠起点锚定在最近的注释 / def / class 上，
    // 这样折叠后三角标正好落在注释或函数名行上。
    if (start > 0) {
      let k = start - 1;
      while (k >= 0 && BLANK_RE.test(lines[k])) {
        k -= 1;
      }
      if (k >= 0 && info[k].visible) {
        foldStart = k;
      }
    }

    if (foldStart < 0) {
      // 没有锚点时，从代码段第一个非空行开始
      for (let k = start; k <= end; k += 1) {
        if (!BLANK_RE.test(lines[k])) {
          foldStart = k;
          break;
        }
      }
    }

    if (foldStart < 0 || end - foldStart < 1) {
      continue;
    }
    ranges.push({ start: foldStart, end });
  }

  return ranges;
}

/**
 * 用“三引号字符串内出现次数奇偶”做启发式判断，
 * 避免把文档字符串里以 # 或 def 开头的行误当成可见行。
 */
function updateStringState(line: string, inString: boolean): boolean {
  TRIPLE_RE.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = TRIPLE_RE.exec(line)) !== null) {
    count += 1;
  }
  return count % 2 === 1 ? !inString : inString;
}
