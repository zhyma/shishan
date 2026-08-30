import { createHash } from 'node:crypto';
import type Parser from 'tree-sitter';
import {
  parseAnnotationComments,
  type AnnotationBlock,
  type Diagnostic,
  type FileAnalysis,
  type NarrativeDetail,
  type NarrativeEdge,
  type NarrativeKind,
  type NarrativeNode,
  type ParseMode,
  type SourceRange,
  type SupportedLanguage,
  type SymbolInfo
} from '@shishan/protocol';
import { extractCommentTokens } from './comments.js';
import {
  getLanguageDefinition,
  isFunctionNode,
  isStatementNode,
  type LanguageDefinition
} from './language.js';

interface BoundAnnotation {
  annotation: AnnotationBlock;
  node: Parser.SyntaxNode;
}

interface FlowRecord {
  annotation: AnnotationBlock;
  syntax: Parser.SyntaxNode;
  narrative: NarrativeNode;
}

interface DetailRecord {
  annotation: AnnotationBlock;
  syntaxStart: Parser.SyntaxNode;
  syntaxEnd: Parser.SyntaxNode;
  detail: NarrativeDetail;
}

const implementationFingerprints = new WeakMap<
  FileAnalysis,
  ReadonlyMap<string, string>
>();

function rangeForNode(path: string, node: Parser.SyntaxNode): SourceRange {
  return {
    path,
    start: {
      line: node.startPosition.row,
      column: node.startPosition.column
    },
    end: {
      line: node.endPosition.row,
      column: node.endPosition.column
    }
  };
}

function collectNodes(
  root: Parser.SyntaxNode,
  predicate: (node: Parser.SyntaxNode) => boolean
): Parser.SyntaxNode[] {
  const result: Parser.SyntaxNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (predicate(node)) {
      result.push(node);
    }
    for (let index = node.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = node.namedChildren[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return result.sort((left, right) => left.startIndex - right.startIndex);
}

function findDescendant(
  root: Parser.SyntaxNode,
  predicate: (node: Parser.SyntaxNode) => boolean
): Parser.SyntaxNode | undefined {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (predicate(node)) {
      return node;
    }
    for (let index = node.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = node.namedChildren[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return undefined;
}

function readableIdentifier(node: Parser.SyntaxNode): string | undefined {
  const allowed = new Set([
    'identifier',
    'property_identifier',
    'field_identifier',
    'type_identifier',
    'qualified_identifier',
    'operator_name',
    'destructor_name'
  ]);
  const direct = node.childForFieldName('name');
  if (direct && allowed.has(direct.type)) {
    return direct.text;
  }
  const descendant = findDescendant(node, (candidate) =>
    allowed.has(candidate.type)
  );
  return descendant?.text;
}

export function functionName(node: Parser.SyntaxNode): string | undefined {
  const direct = node.childForFieldName('name');
  if (direct) {
    return direct.text;
  }

  if (node.type === 'function_definition') {
    const declarator = node.childForFieldName('declarator');
    if (declarator) {
      return readableIdentifier(declarator);
    }
  }

  let valueNode = node;
  let parent = node.parent;
  while (
    parent &&
    [
      'parenthesized_expression',
      'as_expression',
      'satisfies_expression',
      'type_assertion'
    ].includes(parent.type)
  ) {
    valueNode = parent;
    parent = parent.parent;
  }
  if (parent) {
    const value =
      parent.childForFieldName('value') ??
      parent.childForFieldName('right');
    if (value?.id === valueNode.id) {
      const name =
        parent.childForFieldName('name') ??
        parent.childForFieldName('left') ??
        parent.childForFieldName('key');
      if (name) {
        return name.text;
      }
    }
  }

  return undefined;
}

function annotationDiagnostic(
  annotation: AnnotationBlock,
  code: string,
  message: string,
  severity: Diagnostic['severity'] = 'warning',
  suggestion?: string
): Diagnostic {
  return {
    code,
    severity,
    message,
    path: annotation.source.path,
    range: annotation.source,
    annotationId: annotation.localId,
    suggestion
  };
}

function nodeContains(
  container: Parser.SyntaxNode,
  start: Parser.SyntaxNode,
  end: Parser.SyntaxNode = start
): boolean {
  return (
    container.startIndex <= start.startIndex &&
    container.endIndex >= end.endIndex
  );
}

function bindAnnotation(
  annotation: AnnotationBlock,
  definition: LanguageDefinition,
  candidates: readonly Parser.SyntaxNode[]
): { bound?: BoundAnnotation; diagnostic?: Diagnostic } {
  const next = candidates.find(
    (candidate) =>
      candidate.startIndex >= annotation.endOffset &&
      candidate.startPosition.column === annotation.indent
  );

  if (!next) {
    return {
      diagnostic: annotationDiagnostic(
        annotation,
        'SHISHAN301',
        'No syntax node follows annotation ' + annotation.localId + '.',
        'warning',
        'Move the annotation directly above the code it describes.'
      )
    };
  }

  if (annotation.kind === 'function') {
    const functionNode = isFunctionNode(definition, next)
      ? next
      : findDescendant(next, (node) => isFunctionNode(definition, node));
    if (functionNode) {
      return { bound: { annotation, node: functionNode } };
    }
  } else if (annotation.kind === 'branch') {
    if (definition.branchTypes.has(next.type)) {
      return { bound: { annotation, node: next } };
    }
  } else if (annotation.kind === 'loop') {
    if (definition.loopTypes.has(next.type)) {
      return { bound: { annotation, node: next } };
    }
  } else if (isStatementNode(definition, next)) {
    return { bound: { annotation, node: next } };
  }

  return {
    diagnostic: annotationDiagnostic(
      annotation,
      'SHISHAN302',
      'Annotation ' +
        annotation.localId +
        ' of kind ' +
        annotation.kind +
        ' cannot describe the next ' +
        next.type +
        ' node.',
      'warning',
      'Move it to a matching statement or change the annotation kind.'
    )
  };
}

function findFunctionScope(
  target: Parser.SyntaxNode,
  functionNodes: readonly Parser.SyntaxNode[]
): Parser.SyntaxNode | undefined {
  return functionNodes
    .filter((candidate) => nodeContains(candidate, target))
    .sort(
      (left, right) =>
        left.endIndex -
        left.startIndex -
        (right.endIndex - right.startIndex)
    )[0];
}

function coveredSiblings(
  target: Parser.SyntaxNode,
  count: number,
  definition: LanguageDefinition
): Parser.SyntaxNode[] {
  const siblings =
    target.parent?.namedChildren.filter((node) =>
      isStatementNode(definition, node)
    ) ?? [target];
  const start = siblings.findIndex((node) => node.id === target.id);
  if (start < 0) {
    return [target];
  }
  return siblings.slice(start, start + count);
}

function makeDetail(
  path: string,
  functionId: string,
  bound: BoundAnnotation,
  definition: LanguageDefinition,
  diagnostics: Diagnostic[]
): DetailRecord {
  const covered = coveredSiblings(
    bound.node,
    bound.annotation.coveredStatements,
    definition
  );
  if (covered.length < bound.annotation.coveredStatements) {
    diagnostics.push(
      annotationDiagnostic(
        bound.annotation,
        'SHISHAN303',
        'Detail ' +
          bound.annotation.localId +
          ' requests ' +
          bound.annotation.coveredStatements +
          ' statements, but only ' +
          covered.length +
          ' remain in this syntax block.',
        'warning',
        'Reduce @covers or move the detail earlier in the block.'
      )
    );
  }
  const last = covered.at(-1) ?? bound.node;
  return {
    annotation: bound.annotation,
    syntaxStart: bound.node,
    syntaxEnd: last,
    detail: {
      id: functionId + '/detail/' + bound.annotation.localId,
      localId: bound.annotation.localId,
      summary: bound.annotation.summary,
      fields: bound.annotation.fields,
      source: {
        path,
        start: rangeForNode(path, bound.node).start,
        end: rangeForNode(path, last).end
      },
      annotationSource: bound.annotation.source,
      coveredStatements: covered.length
    }
  };
}

function edge(
  source: string,
  target: string,
  kind: NarrativeEdge['kind'],
  label?: string
): NarrativeEdge {
  return {
    id: source + '--' + kind + '--' + target,
    source,
    target,
    kind,
    label
  };
}

function connectNarrative(node: NarrativeNode): void {
  node.children.sort(
    (left, right) =>
      left.source.start.line - right.source.start.line ||
      left.source.start.column - right.source.start.column
  );
  for (const child of node.children) {
    connectNarrative(child);
  }

  const edges: NarrativeEdge[] = [];
  const first = node.children[0];
  if (first) {
    const firstKind =
      node.kind === 'branch'
        ? 'true'
        : node.kind === 'loop'
          ? 'body'
          : 'next';
    edges.push(
      edge(
        node.id,
        first.id,
        firstKind,
        node.fields.condition?.[0] ?? node.fields.label?.[0]
      )
    );
  }
  for (let index = 0; index < node.children.length - 1; index += 1) {
    const current = node.children[index];
    const next = node.children[index + 1];
    if (!current || !next) {
      continue;
    }
    const kind =
      current.kind === 'branch'
        ? 'false'
        : current.kind === 'loop'
          ? 'exit'
          : 'next';
    edges.push(edge(current.id, next.id, kind));
  }
  node.edges = edges;
}

function countFlowNodes(nodes: readonly NarrativeNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countFlowNodes(node.children),
    0
  );
}

function countDetails(nodes: readonly NarrativeNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + node.details.length + countDetails(node.children),
    0
  );
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isCommentSyntax(node: Parser.SyntaxNode): boolean {
  return node.type === 'comment' || node.type.endsWith('_comment');
}

function syntaxFingerprint(root: Parser.SyntaxNode): string {
  const digest = createHash('sha256');
  const stack: Array<
    | { kind: 'node'; node: Parser.SyntaxNode }
    | { kind: 'close' }
  > = [{ kind: 'node', node: root }];

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) {
      continue;
    }
    if (item.kind === 'close') {
      digest.update(')');
      continue;
    }
    if (isCommentSyntax(item.node)) {
      continue;
    }

    digest.update('(' + item.node.type.length + ':' + item.node.type);
    const children = item.node.children;
    if (children.length === 0) {
      const text = item.node.text;
      digest.update('=' + Buffer.byteLength(text) + ':' + text);
    }
    stack.push({ kind: 'close' });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) {
        stack.push({ kind: 'node', node: child });
      }
    }
  }

  return digest.digest('hex');
}

export function implementationFingerprint(
  analysis: FileAnalysis,
  functionId: string
): string | undefined {
  return implementationFingerprints.get(analysis)?.get(functionId);
}

export interface AnalyzeTreeOptions {
  path: string;
  language: SupportedLanguage;
  content: string;
  tree: Parser.Tree;
  parseMode: ParseMode;
}

export function analyzeTree(options: AnalyzeTreeOptions): FileAnalysis {
  const { path, language, content, tree, parseMode } = options;
  const definition = getLanguageDefinition(language);
  const diagnostics: Diagnostic[] = [];
  const comments = extractCommentTokens(tree.rootNode, path);
  const parsed = parseAnnotationComments(comments);
  diagnostics.push(...parsed.diagnostics);

  if (tree.rootNode.hasError) {
    diagnostics.push({
      code: 'SHISHAN001',
      severity: 'error',
      message: 'Tree-sitter found a syntax error; narrative bindings may be incomplete.',
      path,
      range: rangeForNode(path, tree.rootNode),
      suggestion: 'Fix the source syntax before relying on this narrative.'
    });
  }

  const allCandidates = collectNodes(
    tree.rootNode,
    (node) =>
      isStatementNode(definition, node) || isFunctionNode(definition, node)
  );
  const namedFunctionNodes = collectNodes(
    tree.rootNode,
    (node) => isFunctionNode(definition, node) && Boolean(functionName(node))
  );
  const bound: BoundAnnotation[] = [];

  for (const annotation of parsed.annotations) {
    const binding = bindAnnotation(annotation, definition, allCandidates);
    if (binding.bound) {
      bound.push(binding.bound);
    }
    if (binding.diagnostic) {
      diagnostics.push(binding.diagnostic);
    }
  }

  const targetOwners = new Map<string, AnnotationBlock>();
  for (const item of bound) {
    if (item.annotation.kind === 'detail') {
      continue;
    }
    const key = item.node.startIndex + ':' + item.node.endIndex;
    const existing = targetOwners.get(key);
    if (existing) {
      diagnostics.push(
        annotationDiagnostic(
          item.annotation,
          'SHISHAN306',
          'Annotations ' +
            existing.localId +
            ' and ' +
            item.annotation.localId +
            ' bind to the same syntax node.',
          'warning',
          'Keep one flow annotation per syntax node.'
        )
      );
    } else {
      targetOwners.set(key, item.annotation);
    }
  }

  const functionBindings = bound.filter(
    (item) => item.annotation.kind === 'function'
  );
  const functionByNode = new Map<number, BoundAnnotation>();
  const functionIds = new Set<string>();
  for (const item of functionBindings) {
    if (functionByNode.has(item.node.id)) {
      diagnostics.push(
        annotationDiagnostic(
          item.annotation,
          'SHISHAN305',
          'More than one function annotation describes ' +
            (functionName(item.node) ?? 'this function') +
            '.',
          'warning',
          'Keep a single @shishan function block above the function.'
        )
      );
      continue;
    }
    if (functionIds.has(item.annotation.localId)) {
      diagnostics.push(
        annotationDiagnostic(
          item.annotation,
          'SHISHAN305',
          'Duplicate function annotation id: ' + item.annotation.localId + '.',
          'warning',
          'Use a unique function id within this file.'
        )
      );
      continue;
    }
    functionIds.add(item.annotation.localId);
    functionByNode.set(item.node.id, item);
  }

  const functions: NarrativeNode[] = [];
  const fingerprints = new Map<string, string>();
  const narrativeByFunctionNode = new Map<number, NarrativeNode>();
  const flowRecordsByFunction = new Map<number, FlowRecord[]>();
  const detailRecordsByFunction = new Map<number, DetailRecord[]>();

  for (const functionNode of namedFunctionNodes) {
    const functionBinding = functionByNode.get(functionNode.id);
    if (!functionBinding) {
      diagnostics.push({
        code: 'SHISHAN401',
        severity: 'info',
        message:
          'Function ' +
          (functionName(functionNode) ?? '<anonymous>') +
          ' has no ShiShan function narrative.',
        path,
        range: rangeForNode(path, functionNode),
        suggestion: 'Add @shishan function and @summary directly above it.'
      });
      continue;
    }

    const id = path + '#' + functionBinding.annotation.localId;
    const narrative: NarrativeNode = {
      id,
      localId: functionBinding.annotation.localId,
      kind: 'function',
      name: functionName(functionNode),
      summary: functionBinding.annotation.summary,
      fields: functionBinding.annotation.fields,
      source: rangeForNode(path, functionNode),
      annotationSource: functionBinding.annotation.source,
      children: [],
      edges: [],
      details: []
    };
    functions.push(narrative);
    fingerprints.set(
      functionBinding.annotation.localId,
      syntaxFingerprint(functionNode)
    );
    narrativeByFunctionNode.set(functionNode.id, narrative);
    flowRecordsByFunction.set(functionNode.id, []);
    detailRecordsByFunction.set(functionNode.id, []);
  }

  for (const item of bound) {
    if (item.annotation.kind === 'function') {
      continue;
    }
    const scope = findFunctionScope(item.node, namedFunctionNodes);
    const functionNarrative = scope
      ? narrativeByFunctionNode.get(scope.id)
      : undefined;
    if (!scope || !functionNarrative) {
      diagnostics.push(
        annotationDiagnostic(
          item.annotation,
          'SHISHAN304',
          'Annotation ' +
            item.annotation.localId +
            ' is not inside a narrated function.',
          'warning',
          'Add a function narrative to the enclosing function.'
        )
      );
      continue;
    }

    if (item.annotation.kind === 'detail') {
      detailRecordsByFunction
        .get(scope.id)
        ?.push(makeDetail(path, functionNarrative.id, item, definition, diagnostics));
      continue;
    }

    const record: FlowRecord = {
      annotation: item.annotation,
      syntax: item.node,
      narrative: {
        id: functionNarrative.id + '/' + item.annotation.localId,
        localId: item.annotation.localId,
        kind: item.annotation.kind as NarrativeKind,
        summary: item.annotation.summary,
        fields: item.annotation.fields,
        source: rangeForNode(path, item.node),
        annotationSource: item.annotation.source,
        children: [],
        edges: [],
        details: []
      }
    };
    flowRecordsByFunction.get(scope.id)?.push(record);
  }

  for (const functionNode of namedFunctionNodes) {
    const functionNarrative = narrativeByFunctionNode.get(functionNode.id);
    if (!functionNarrative) {
      continue;
    }
    const candidateRecords = flowRecordsByFunction.get(functionNode.id) ?? [];
    const localIds = new Set<string>();
    const syntaxTargets = new Set<string>();
    const records: FlowRecord[] = [];
    for (const record of candidateRecords) {
      if (localIds.has(record.annotation.localId)) {
        diagnostics.push(
          annotationDiagnostic(
            record.annotation,
            'SHISHAN305',
            'Duplicate flow annotation id: ' + record.annotation.localId + '.',
            'warning',
            'Use a unique id within the enclosing function.'
          )
        );
        continue;
      }
      const targetKey =
        record.syntax.startIndex + ':' + record.syntax.endIndex;
      if (syntaxTargets.has(targetKey)) {
        continue;
      }
      localIds.add(record.annotation.localId);
      syntaxTargets.add(targetKey);
      records.push(record);
    }

    for (const record of records) {
      const parent = records
        .filter(
          (candidate) =>
            candidate !== record &&
            nodeContains(candidate.syntax, record.syntax) &&
            (candidate.syntax.startIndex !== record.syntax.startIndex ||
              candidate.syntax.endIndex !== record.syntax.endIndex)
        )
        .sort(
          (left, right) =>
            left.syntax.endIndex -
            left.syntax.startIndex -
            (right.syntax.endIndex - right.syntax.startIndex)
        )[0];
      (parent?.narrative.children ?? functionNarrative.children).push(
        record.narrative
      );
    }

    for (const detailRecord of detailRecordsByFunction.get(functionNode.id) ?? []) {
      if (localIds.has(detailRecord.annotation.localId)) {
        diagnostics.push(
          annotationDiagnostic(
            detailRecord.annotation,
            'SHISHAN305',
            'Duplicate annotation id: ' +
              detailRecord.annotation.localId +
              '.',
            'warning',
            'Use a unique id within the enclosing function.'
          )
        );
        continue;
      }
      localIds.add(detailRecord.annotation.localId);
      const owner = records
        .filter((candidate) =>
          nodeContains(
            candidate.syntax,
            detailRecord.syntaxStart,
            detailRecord.syntaxEnd
          )
        )
        .sort(
          (left, right) =>
            left.syntax.endIndex -
            left.syntax.startIndex -
            (right.syntax.endIndex - right.syntax.startIndex)
        )[0];
      (owner?.narrative.details ?? functionNarrative.details).push(
        detailRecord.detail
      );
    }
    connectNarrative(functionNarrative);
  }

  functions.sort(
    (left, right) =>
      left.source.start.line - right.source.start.line ||
      left.source.start.column - right.source.start.column
  );
  const symbols: SymbolInfo[] = namedFunctionNodes.map((node) => {
    const narrative = narrativeByFunctionNode.get(node.id);
    const name = functionName(node) ?? '<anonymous>';
    return {
      id: path + '#symbol:' + name + ':' + node.startIndex,
      name,
      kind: 'function',
      source: rangeForNode(path, node),
      narrativeId: narrative?.id
    };
  });
  const narratedFunctions = symbols.filter((symbol) => symbol.narrativeId).length;
  const totalFunctions = symbols.length;

  const analysis: FileAnalysis = {
    path,
    language,
    contentHash: contentHash(content),
    functions,
    symbols,
    diagnostics,
    coverage: {
      totalFunctions,
      narratedFunctions,
      percent:
        totalFunctions === 0
          ? 100
          : Math.round((narratedFunctions / totalFunctions) * 10_000) / 100,
      flowNodes: countFlowNodes(functions),
      details: countDetails(functions)
    },
    parseMode,
    syntaxError: tree.rootNode.hasError
  };
  implementationFingerprints.set(analysis, fingerprints);
  return analysis;
}
