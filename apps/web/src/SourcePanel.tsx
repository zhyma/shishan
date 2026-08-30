import { useEffect, useMemo, useState } from 'react';
import type { SourceRange } from '@shishan/protocol';

interface SourcePanelProps {
  range?: SourceRange;
  version?: string;
  staticSources?: Readonly<Record<string, string>>;
  staticMode?: boolean;
}

const MAX_VISIBLE_LINES = 240;

export function SourcePanel({
  range,
  version,
  staticSources,
  staticMode = false
}: SourcePanelProps) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range) {
      setSource('');
      setError('');
      return;
    }
    const controller = new AbortController();
    setSource('');
    setError('');
    if (staticMode) {
      const staticSource = staticSources?.[range.path];
      if (staticSource === undefined) {
        setError(
          'Source was not included in this static export. Re-export with --include-source to enable source navigation.'
        );
      } else {
        setSource(staticSource);
      }
      return;
    }
    fetch('/api/source?path=' + encodeURIComponent(range.path), {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load source (' + response.status + ').');
        }
        return response.text();
      })
      .then(setSource)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => controller.abort();
  }, [range?.path, staticMode, staticSources, version]);

  const visible = useMemo(() => {
    if (!range || !source) {
      return { lines: [], truncated: false };
    }
    const lines = source.split(/\r?\n/);
    const first = Math.max(0, range.start.line - 5);
    const requestedLast = Math.min(lines.length - 1, range.end.line + 5);
    const last = Math.min(requestedLast, first + MAX_VISIBLE_LINES - 1);
    return {
      lines: lines.slice(first, last + 1).map((text, offset) => ({
        number: first + offset,
        text,
        selected:
          first + offset >= range.start.line &&
          first + offset <= range.end.line
      })),
      truncated: last < requestedLast
    };
  }, [range, source]);

  if (!range) {
    return (
      <aside className="source-panel source-empty">
        Select a narrative node to inspect its source.
      </aside>
    );
  }

  return (
    <aside className="source-panel">
      <header>
        <div>
          <span className="eyebrow">Source</span>
          <strong>{range.path}</strong>
        </div>
        <span>
          L{range.start.line + 1}–{range.end.line + 1}
        </span>
      </header>
      {error ? <p className="source-error">{error}</p> : null}
      {!error && visible.lines.length === 0 ? (
        <p className="source-loading">Loading source…</p>
      ) : null}
      {visible.truncated ? (
        <p className="source-limit">
          Showing the first {MAX_VISIBLE_LINES} lines of this range.
        </p>
      ) : null}
      <pre>
        <code>
          {visible.lines.map((line) => (
            <span
              className={line.selected ? 'code-line selected' : 'code-line'}
              key={line.number}
            >
              <span className="line-number">{line.number + 1}</span>
              <span className="line-text">{line.text || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </aside>
  );
}
