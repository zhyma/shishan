import type {
  AnnotationBlock,
  AnnotationKind,
  AnnotationParseResult,
  CommentToken,
  Diagnostic,
  NarrativeFields,
  SourceRange
} from './types.js';

const HEADER_RE = /^@shishan\s+(\S+)(?:\s+(\S+))?\s*$/;
const FIELD_RE = /^@([a-z][a-z-]*)\s+(.+?)\s*$/;
const LOCAL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KINDS = new Set<AnnotationKind>([
  'function',
  'step',
  'branch',
  'loop',
  'detail'
]);
const ALLOWED_FIELDS = new Set([
  'summary',
  'input',
  'output',
  'condition',
  'effect',
  'note',
  'covers',
  'label'
]);
const SINGLE_FIELDS = new Set(['summary', 'condition', 'covers', 'label']);

function makeDiagnostic(
  token: CommentToken,
  code: string,
  message: string,
  suggestion?: string
): Diagnostic {
  return {
    code,
    severity: code.startsWith('SHISHAN1') ? 'error' : 'warning',
    message,
    path: token.range.path,
    range: token.range,
    suggestion
  };
}

function addField(fields: NarrativeFields, name: string, value: string): void {
  const values = fields[name] ?? [];
  values.push(value);
  fields[name] = values;
}

function blockSource(first: CommentToken, last: CommentToken): SourceRange {
  return {
    path: first.range.path,
    start: first.range.start,
    end: last.range.end
  };
}

function areConsecutive(previous: CommentToken, current: CommentToken): boolean {
  return (
    current.range.start.line === previous.range.end.line + 1 &&
    current.indent === previous.indent &&
    current.prefix === previous.prefix
  );
}

function parseCoverage(
  token: CommentToken,
  kind: AnnotationKind,
  value: string,
  diagnostics: Diagnostic[]
): number {
  if (kind !== 'detail') {
    diagnostics.push(
      makeDiagnostic(
        token,
        'SHISHAN203',
        '@covers is only valid on detail annotations.',
        'Remove @covers or change the annotation kind to detail.'
      )
    );
    return 1;
  }

  const match = /^statements=([1-9]\d*)$/.exec(value);
  if (!match) {
    diagnostics.push(
      makeDiagnostic(
        token,
        'SHISHAN104',
        'Invalid @covers value: ' + value + '.',
        'Use @covers statements=N where N is a positive integer.'
      )
    );
    return 1;
  }

  return Number(match[1]);
}

export function parseAnnotationComments(
  comments: readonly CommentToken[]
): AnnotationParseResult {
  const sorted = [...comments].sort(
    (left, right) => left.startOffset - right.startOffset
  );
  const annotations: AnnotationBlock[] = [];
  const diagnostics: Diagnostic[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const header = sorted[index];
    if (!header) {
      continue;
    }

    const headerMatch = HEADER_RE.exec(header.text.trim());
    if (!headerMatch) {
      if (header.text.trim().startsWith('@shishan')) {
        diagnostics.push(
          makeDiagnostic(
            header,
            'SHISHAN101',
            'Malformed @shishan header.',
            'Use @shishan <kind> <lowercase-hyphen-id>.'
          )
        );
      }
      continue;
    }

    const rawKind = headerMatch[1] ?? '';
    const localId = headerMatch[2] ?? '';
    if (!KINDS.has(rawKind as AnnotationKind)) {
      diagnostics.push(
        makeDiagnostic(
          header,
          'SHISHAN102',
          'Unknown annotation kind: ' + rawKind + '.',
          'Use function, step, branch, loop, or detail.'
        )
      );
      continue;
    }
    const kind = rawKind as AnnotationKind;

    if (!LOCAL_ID_RE.test(localId)) {
      diagnostics.push(
        makeDiagnostic(
          header,
          'SHISHAN103',
          'Invalid or missing annotation id: ' + (localId || '<missing>') + '.',
          'Use a lowercase hyphenated id, for example validate-order.'
        )
      );
      continue;
    }

    const fields: NarrativeFields = {};
    let last = header;
    while (index + 1 < sorted.length) {
      const candidate = sorted[index + 1];
      if (!candidate || !areConsecutive(last, candidate)) {
        break;
      }
      const fieldMatch = FIELD_RE.exec(candidate.text.trim());
      if (!fieldMatch || candidate.text.trim().startsWith('@shishan')) {
        break;
      }

      index += 1;
      last = candidate;
      const fieldName = fieldMatch[1] ?? '';
      const fieldValue = fieldMatch[2] ?? '';
      if (!ALLOWED_FIELDS.has(fieldName)) {
        diagnostics.push(
          makeDiagnostic(
            candidate,
            'SHISHAN201',
            'Unknown annotation field: @' + fieldName + '.',
            'Use a documented ShiShan field or remove this line.'
          )
        );
      }
      addField(fields, fieldName, fieldValue);
    }

    for (const fieldName of SINGLE_FIELDS) {
      const values = fields[fieldName];
      if (values && values.length > 1) {
        diagnostics.push(
          makeDiagnostic(
            header,
            'SHISHAN202',
            'Annotation ' +
              localId +
              ' has more than one @' +
              fieldName +
              ' field.',
            'Keep a single @' + fieldName + ' field.'
          )
        );
      }
    }

    const summary = fields.summary?.[0]?.trim() ?? '';
    if (!summary) {
      diagnostics.push(
        makeDiagnostic(
          header,
          'SHISHAN105',
          'Annotation ' + localId + ' is missing @summary.',
          'Add a concise @summary on the following comment line.'
        )
      );
    }

    let coveredStatements = 1;
    const covers = fields.covers;
    if (covers?.[0]) {
      coveredStatements = parseCoverage(
        header,
        kind,
        covers[0],
        diagnostics
      );
    }

    annotations.push({
      kind,
      localId,
      fields,
      summary,
      coveredStatements,
      indent: header.indent,
      startOffset: header.startOffset,
      endOffset: last.endOffset,
      source: blockSource(header, last),
      headerCommentKey: header.key
    });
  }

  return { annotations, diagnostics };
}
