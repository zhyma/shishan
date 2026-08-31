import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type {
  NarrativeNode,
  ProjectNarrativeFlow,
  ProjectNarrativeNode,
  SourceRange
} from '@shishan/protocol';
import { useI18n } from './i18n.js';
import {
  narrativeDetails,
  narrativeOutline,
  projectNodeRelations
} from './narrative-levels.js';

type InspectorLevel = 'overview' | 'flow' | 'implementation';

interface ProjectNodeInspectorProps {
  flow: ProjectNarrativeFlow;
  node: ProjectNarrativeNode;
  narrative?: NarrativeNode;
  onClose(): void;
  onSelectSource(range: SourceRange): void;
  onOpenFunction(node: ProjectNarrativeNode): void;
}

const narrativeKindKeys = {
  function: 'narrative.kind.function',
  step: 'narrative.kind.step',
  branch: 'narrative.kind.branch',
  loop: 'narrative.kind.loop',
  call: 'narrative.kind.call',
  error: 'narrative.kind.error',
  async: 'narrative.kind.async'
} as const;

const inspectorLevelKeys = {
  overview: 'inspector.overview',
  flow: 'inspector.flow',
  implementation: 'inspector.implementation'
} as const;

// @shishan function project-node-inspector
// @summary Present one project node as overview, nested function flow, and implementation details
// @input selected project flow, node, and optional bound function narrative
// @output interactive progressive-detail panel with source navigation
export function ProjectNodeInspector({
  flow,
  node,
  narrative,
  onClose,
  onSelectSource,
  onOpenFunction
}: ProjectNodeInspectorProps) {
  const { t } = useI18n();
  const [level, setLevel] = useState<InspectorLevel>('overview');
  const outline = useMemo(
    () => (narrative ? narrativeOutline(narrative) : []),
    [narrative]
  );
  const details = useMemo(
    () => (narrative ? narrativeDetails(narrative) : []),
    [narrative]
  );
  const relations = useMemo(
    () => projectNodeRelations(flow, node.id),
    [flow, node.id]
  );
  const sourceRange = node.source?.range;

  useEffect(() => setLevel('overview'), [node.id]);

  return (
    <aside className="project-node-inspector" aria-label={t('inspector.title')}>
      <header>
        <div>
          <span className="eyebrow">{t('inspector.title')}</span>
          <h2>{node.label}</h2>
        </div>
        <button
          className="inspector-close"
          type="button"
          aria-label={t('inspector.close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="inspector-levels" role="tablist" aria-label={t('inspector.level')}>
        {(['overview', 'flow', 'implementation'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={level === item}
            className={level === item ? 'active' : ''}
            onClick={() => setLevel(item)}
          >
            {t(inspectorLevelKeys[item])}
          </button>
        ))}
      </div>

      <div className="inspector-content">
        {level === 'overview' ? (
          <div className="inspector-overview">
            <p className="inspector-summary">{node.summary}</p>
            {node.source ? (
              <section>
                <h3>{t('inspector.boundSource')}</h3>
                <code>
                  {node.source.path}
                  {node.source.symbol ? ' · ' + node.source.symbol : ''}
                </code>
              </section>
            ) : null}
            <section>
              <h3>{t('inspector.relationships')}</h3>
              <dl className="project-relations">
                <div>
                  <dt>{t('inspector.incoming')}</dt>
                  <dd>
                    {relations.incoming.length > 0
                      ? relations.incoming.map(({ edge, node: related }) => (
                          <span key={edge.id}>{related?.label ?? edge.source}</span>
                        ))
                      : t('inspector.noIncoming')}
                  </dd>
                </div>
                <div>
                  <dt>{t('inspector.outgoing')}</dt>
                  <dd>
                    {relations.outgoing.length > 0
                      ? relations.outgoing.map(({ edge, node: related }) => (
                          <span key={edge.id}>{related?.label ?? edge.target}</span>
                        ))
                      : t('inspector.noOutgoing')}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        ) : null}

        {level === 'flow' ? (
          narrative ? (
            <section className="inspector-flow-list">
              <p className="inspector-count">
                {t('inspector.flowNodes', { count: outline.length })}
              </p>
              {outline.map(({ node: item, depth }) => (
                <button
                  type="button"
                  key={item.id}
                  style={{ '--outline-depth': depth } as CSSProperties}
                  onClick={() => onSelectSource(item.source)}
                >
                  <span>{t(narrativeKindKeys[item.kind])}</span>
                  <strong>{item.name ?? item.localId}</strong>
                  <small>{item.summary}</small>
                </button>
              ))}
            </section>
          ) : (
            <p className="inspector-empty">{t('inspector.noFunction')}</p>
          )
        ) : null}

        {level === 'implementation' ? (
          details.length > 0 ? (
            <section className="inspector-detail-list">
              {details.map(({ detail, parent }) => (
                <button
                  type="button"
                  key={detail.id}
                  onClick={() => onSelectSource(detail.source)}
                >
                  <span>{parent.name ?? parent.localId}</span>
                  <strong>{detail.summary}</strong>
                  <small>
                    L{detail.source.start.line + 1} ·{' '}
                    {t('details.coveredStatements', {
                      count: detail.coveredStatements
                    })}
                  </small>
                </button>
              ))}
            </section>
          ) : (
            <p className="inspector-empty">{t('details.none')}</p>
          )
        ) : null}
      </div>

      <footer>
        {sourceRange ? (
          <button type="button" onClick={() => onSelectSource(sourceRange)}>
            {t('inspector.openSource')}
          </button>
        ) : null}
        {narrative ? (
          <button type="button" onClick={() => onOpenFunction(node)}>
            {t('inspector.openFunction')}
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
