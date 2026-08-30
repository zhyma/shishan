export const PROTOCOL_VERSION = 'shishan/v1' as const;

export type SupportedLanguage =
  | 'python'
  | 'cpp'
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx';

export type NarrativeKind = 'function' | 'step' | 'branch' | 'loop';
export type AnnotationKind = NarrativeKind | 'detail';
export type ParseMode = 'full' | 'incremental' | 'reused';
export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type EdgeKind = 'next' | 'true' | 'false' | 'body' | 'exit';

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  path: string;
  start: SourcePosition;
  end: SourcePosition;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string;
  range?: SourceRange;
  annotationId?: string;
  suggestion?: string;
}

export type NarrativeFields = Record<string, string[]>;

export interface NarrativeDetail {
  id: string;
  localId: string;
  summary: string;
  fields: NarrativeFields;
  source: SourceRange;
  annotationSource: SourceRange;
  coveredStatements: number;
}

export interface NarrativeEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export interface NarrativeNode {
  id: string;
  localId: string;
  kind: NarrativeKind;
  name?: string;
  summary: string;
  fields: NarrativeFields;
  source: SourceRange;
  annotationSource: SourceRange;
  children: NarrativeNode[];
  edges: NarrativeEdge[];
  details: NarrativeDetail[];
}

export interface SymbolInfo {
  id: string;
  name: string;
  kind: 'function';
  source: SourceRange;
  narrativeId?: string;
}

export interface FileCoverage {
  totalFunctions: number;
  narratedFunctions: number;
  percent: number;
  flowNodes: number;
  details: number;
}

export interface FileAnalysis {
  path: string;
  language: SupportedLanguage;
  contentHash: string;
  functions: NarrativeNode[];
  symbols: SymbolInfo[];
  diagnostics: Diagnostic[];
  coverage: FileCoverage;
  parseMode: ParseMode;
  syntaxError: boolean;
}

export interface ProjectCoverage extends FileCoverage {
  files: number;
  filesWithNarratives: number;
}

export interface UpdateMetrics {
  requestedPaths: string[];
  parsedPaths: string[];
  removedPaths: string[];
  unchangedPaths: string[];
  reusedFileCount: number;
  durationMs: number;
}

export interface IndexMetrics {
  totalParseOperations: number;
  fullParses: number;
  incrementalParses: number;
  skippedUnchangedFiles: number;
  lastUpdate: UpdateMetrics;
}

export interface ProjectSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
  rootName: string;
  files: FileAnalysis[];
  coverage: ProjectCoverage;
  metrics: IndexMetrics;
}

export interface ProjectPatch {
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
  upsertFiles: FileAnalysis[];
  removedFiles: string[];
  coverage: ProjectCoverage;
  metrics: IndexMetrics;
}

export interface ShiShanConfig {
  protocol: typeof PROTOCOL_VERSION;
  include: string[];
  exclude: string[];
  server: {
    host: string;
    port: number;
  };
}

export interface CommentToken {
  key: string;
  text: string;
  prefix: string;
  indent: number;
  startOffset: number;
  endOffset: number;
  range: SourceRange;
}

export interface AnnotationBlock {
  kind: AnnotationKind;
  localId: string;
  fields: NarrativeFields;
  summary: string;
  coveredStatements: number;
  indent: number;
  startOffset: number;
  endOffset: number;
  source: SourceRange;
  headerCommentKey: string;
}

export interface AnnotationParseResult {
  annotations: AnnotationBlock[];
  diagnostics: Diagnostic[];
}

export const DEFAULT_CONFIG: ShiShanConfig = {
  protocol: PROTOCOL_VERSION,
  include: [
    '**/*.py',
    '**/*.cpp',
    '**/*.cc',
    '**/*.cxx',
    '**/*.hpp',
    '**/*.h',
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs'
  ],
  exclude: [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.shishan/cache/**',
    '**/*.d.ts'
  ],
  server: {
    host: '127.0.0.1',
    port: 4173
  }
};
