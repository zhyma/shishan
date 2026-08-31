import { useEffect, useMemo, useState } from 'react';
import type { SourceRange } from '@shishan/protocol';
import { vscodeSourceUrl } from './editor-link.js';
import { useI18n } from './i18n.js';

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
  const { t } = useI18n();
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
        setError(t('source.notIncluded'));
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
          throw new Error(t('source.loadFailed', { status: response.status }));
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
  }, [range?.path, staticMode, staticSources, t, version]);

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
        {t('source.empty')}
      </aside>
    );
  }

  return (
    <aside className="source-panel">
      <header>
        <div>
          <span className="eyebrow">{t('source.title')}</span>
          <strong>{range.path}</strong>
        </div>
        <div className="source-actions">
          {!staticMode ? (
            <a href={vscodeSourceUrl(range)}>{t('source.openVsCode')}</a>
          ) : null}
          <span>
            L{range.start.line + 1}–{range.end.line + 1}
          </span>
        </div>
      </header>
      {error ? <p className="source-error">{error}</p> : null}
      {!error && visible.lines.length === 0 ? (
        <p className="source-loading">{t('source.loading')}</p>
      ) : null}
      {visible.truncated ? (
        <p className="source-limit">
          {t('source.limit', { count: MAX_VISIBLE_LINES })}
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
