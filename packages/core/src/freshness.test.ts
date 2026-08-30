import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { SupportedLanguage } from '@shishan/protocol';
import { compareNarrativeFreshness } from './freshness.js';
import { ParserEngine } from './parser-engine.js';
import { ProjectIndex } from './project-index.js';

const execFileAsync = promisify(execFile);

function typescriptSource(value: number, summary = 'Return the configured value') {
  return [
    '// @shishan function read-value',
    '// @summary Read a stable numeric value',
    'export function readValue() {',
    '  // An ordinary implementation comment.',
    '  // @shishan step return-value',
    '  // @summary ' + summary,
    '  return ' + value + ';',
    '}',
    ''
  ].join('\n');
}

function analyze(
  engine: ParserEngine,
  source: string,
  path = 'value.ts',
  language: SupportedLanguage = 'typescript'
) {
  return engine.analyze(path, language, source).analysis;
}

describe('narrative freshness', () => {
  it('flags implementation changes when the narrative is unchanged', () => {
    const engine = new ParserEngine();
    const baseline = analyze(engine, typescriptSource(1));
    const current = analyze(engine, typescriptSource(2));

    expect(compareNarrativeFreshness(current, baseline, 'HEAD')).toEqual([
      expect.objectContaining({
        code: 'SHISHAN501',
        severity: 'warning',
        annotationId: 'read-value'
      })
    ]);
  });

  it.each<
    [string, string, SupportedLanguage, string, string]
  >([
    [
      'Python',
      'value.py',
      'python',
      [
        '# @shishan function read-value',
        '# @summary Read a stable numeric value',
        'def read_value():',
        '    # @shishan step return-value',
        '    # @summary Return the configured value',
        '    return 1',
        ''
      ].join('\n'),
      'return 2'
    ],
    [
      'C++',
      'value.cpp',
      'cpp',
      [
        '// @shishan function read-value',
        '// @summary Read a stable numeric value',
        'int readValue() {',
        '  // @shishan step return-value',
        '  // @summary Return the configured value',
        '  return 1;',
        '}',
        ''
      ].join('\n'),
      'return 2;'
    ],
    [
      'JavaScript',
      'value.js',
      'javascript',
      typescriptSource(1),
      'return 2;'
    ],
    [
      'TypeScript',
      'value.ts',
      'typescript',
      typescriptSource(1),
      'return 2;'
    ],
    [
      'JSX',
      'value.jsx',
      'jsx',
      [
        '// @shishan function render-value',
        '// @summary Render a stable numeric value',
        'export function Value() {',
        '  // @shishan step return-value',
        '  // @summary Return the configured value element',
        '  return <span>{1}</span>;',
        '}',
        ''
      ].join('\n'),
      'return <span>{2}</span>;'
    ],
    [
      'TSX',
      'value.tsx',
      'tsx',
      [
        '// @shishan function render-value',
        '// @summary Render a stable numeric value',
        'export function Value(): JSX.Element {',
        '  // @shishan step return-value',
        '  // @summary Return the configured value element',
        '  return <span>{1}</span>;',
        '}',
        ''
      ].join('\n'),
      'return <span>{2}</span>;'
    ]
  ])(
    'detects unchanged narratives in %s',
    (_name, path, language, baselineSource, changedLine) => {
      const engine = new ParserEngine();
      const baseline = analyze(engine, baselineSource, path, language);
      const current = analyze(
        engine,
        baselineSource.replace(
          language === 'python'
            ? 'return 1'
            : language === 'jsx' || language === 'tsx'
              ? 'return <span>{1}</span>;'
              : 'return 1;',
          changedLine
        ),
        path,
        language
      );

      expect(compareNarrativeFreshness(current, baseline, 'HEAD')).toEqual([
        expect.objectContaining({ code: 'SHISHAN501' })
      ]);
    }
  );

  it('accepts a synchronized narrative update', () => {
    const engine = new ParserEngine();
    const baseline = analyze(engine, typescriptSource(1));
    const current = analyze(
      engine,
      typescriptSource(2, 'Return the recalculated configured value')
    );

    expect(compareNarrativeFreshness(current, baseline, 'HEAD')).toEqual([]);
  });

  it('ignores whitespace and ordinary comment-only changes', () => {
    const engine = new ParserEngine();
    const baseline = analyze(engine, typescriptSource(1));
    const current = analyze(
      engine,
      typescriptSource(1)
        .replace('ordinary implementation comment', 'reviewed comment')
        .replace('return 1;', 'return    1 ;')
    );

    expect(compareNarrativeFreshness(current, baseline, 'HEAD')).toEqual([]);
  });

  it('adds and clears Git freshness diagnostics with one-file updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-freshness-git-'));
    const path = join(root, 'value.ts');
    await writeFile(path, typescriptSource(1));
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'ShiShan Test'], {
      cwd: root
    });
    await execFileAsync('git', ['config', 'user.email', 'test@shishan.local'], {
      cwd: root
    });
    await execFileAsync('git', ['add', 'value.ts'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });

    await writeFile(path, typescriptSource(2));
    const index = await ProjectIndex.create(root, {
      freshness: { base: 'HEAD', required: true }
    });
    const initial = await index.initialize();
    expect(initial.files[0]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SHISHAN501' })
      ])
    );

    await writeFile(
      path,
      typescriptSource(2, 'Return the recalculated configured value')
    );
    const patch = await index.updatePaths(['value.ts']);
    expect(patch.upsertFiles).toHaveLength(1);
    expect(patch.upsertFiles[0]?.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SHISHAN501' })
      ])
    );
    expect(patch.metrics.lastUpdate.parsedPaths).toEqual(['value.ts']);
  });
});
