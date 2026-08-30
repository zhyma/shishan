import { extname } from 'node:path';
import type Parser from 'tree-sitter';
import Cpp from 'tree-sitter-cpp';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';
import type { SupportedLanguage } from '@shishan/protocol';

export interface LanguageDefinition {
  id: SupportedLanguage;
  grammar: unknown;
  functionTypes: ReadonlySet<string>;
  statementTypes: ReadonlySet<string>;
  branchTypes: ReadonlySet<string>;
  loopTypes: ReadonlySet<string>;
}

const PYTHON_FUNCTIONS = new Set(['function_definition']);
const PYTHON_BRANCHES = new Set([
  'if_statement',
  'match_statement',
  'try_statement'
]);
const PYTHON_LOOPS = new Set(['for_statement', 'while_statement']);
const PYTHON_STATEMENTS = new Set([
  ...PYTHON_FUNCTIONS,
  ...PYTHON_BRANCHES,
  ...PYTHON_LOOPS,
  'expression_statement',
  'return_statement',
  'raise_statement',
  'assert_statement',
  'pass_statement',
  'break_statement',
  'continue_statement',
  'delete_statement',
  'global_statement',
  'nonlocal_statement',
  'import_statement',
  'import_from_statement',
  'future_import_statement',
  'with_statement'
]);

const JAVASCRIPT_FUNCTIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'generator_function',
  'arrow_function',
  'method_definition'
]);
const JAVASCRIPT_BRANCHES = new Set([
  'if_statement',
  'switch_statement',
  'try_statement'
]);
const JAVASCRIPT_LOOPS = new Set([
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement'
]);
const JAVASCRIPT_STATEMENTS = new Set([
  ...JAVASCRIPT_FUNCTIONS,
  ...JAVASCRIPT_BRANCHES,
  ...JAVASCRIPT_LOOPS,
  'lexical_declaration',
  'variable_declaration',
  'expression_statement',
  'return_statement',
  'throw_statement',
  'break_statement',
  'continue_statement',
  'debugger_statement',
  'empty_statement',
  'labeled_statement',
  'with_statement',
  'import_statement',
  'export_statement',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration'
]);

const CPP_FUNCTIONS = new Set(['function_definition']);
const CPP_BRANCHES = new Set([
  'if_statement',
  'switch_statement',
  'try_statement'
]);
const CPP_LOOPS = new Set([
  'for_statement',
  'for_range_loop',
  'while_statement',
  'do_statement'
]);
const CPP_STATEMENTS = new Set([
  ...CPP_FUNCTIONS,
  ...CPP_BRANCHES,
  ...CPP_LOOPS,
  'declaration',
  'expression_statement',
  'return_statement',
  'throw_statement',
  'break_statement',
  'continue_statement',
  'goto_statement',
  'labeled_statement',
  'co_return_statement'
]);

const DEFINITIONS: Record<SupportedLanguage, LanguageDefinition> = {
  python: {
    id: 'python',
    grammar: Python,
    functionTypes: PYTHON_FUNCTIONS,
    statementTypes: PYTHON_STATEMENTS,
    branchTypes: PYTHON_BRANCHES,
    loopTypes: PYTHON_LOOPS
  },
  cpp: {
    id: 'cpp',
    grammar: Cpp,
    functionTypes: CPP_FUNCTIONS,
    statementTypes: CPP_STATEMENTS,
    branchTypes: CPP_BRANCHES,
    loopTypes: CPP_LOOPS
  },
  javascript: {
    id: 'javascript',
    grammar: JavaScript,
    functionTypes: JAVASCRIPT_FUNCTIONS,
    statementTypes: JAVASCRIPT_STATEMENTS,
    branchTypes: JAVASCRIPT_BRANCHES,
    loopTypes: JAVASCRIPT_LOOPS
  },
  jsx: {
    id: 'jsx',
    grammar: JavaScript,
    functionTypes: JAVASCRIPT_FUNCTIONS,
    statementTypes: JAVASCRIPT_STATEMENTS,
    branchTypes: JAVASCRIPT_BRANCHES,
    loopTypes: JAVASCRIPT_LOOPS
  },
  typescript: {
    id: 'typescript',
    grammar: TypeScript.typescript,
    functionTypes: JAVASCRIPT_FUNCTIONS,
    statementTypes: JAVASCRIPT_STATEMENTS,
    branchTypes: JAVASCRIPT_BRANCHES,
    loopTypes: JAVASCRIPT_LOOPS
  },
  tsx: {
    id: 'tsx',
    grammar: TypeScript.tsx,
    functionTypes: JAVASCRIPT_FUNCTIONS,
    statementTypes: JAVASCRIPT_STATEMENTS,
    branchTypes: JAVASCRIPT_BRANCHES,
    loopTypes: JAVASCRIPT_LOOPS
  }
};

const EXTENSIONS: Record<string, SupportedLanguage> = {
  '.py': 'python',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.h': 'cpp',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx'
};

export function languageForPath(path: string): SupportedLanguage | undefined {
  return EXTENSIONS[extname(path).toLowerCase()];
}

export function getLanguageDefinition(
  language: SupportedLanguage
): LanguageDefinition {
  return DEFINITIONS[language];
}

export function isFunctionNode(
  definition: LanguageDefinition,
  node: Parser.SyntaxNode
): boolean {
  return definition.functionTypes.has(node.type);
}

export function isStatementNode(
  definition: LanguageDefinition,
  node: Parser.SyntaxNode
): boolean {
  return definition.statementTypes.has(node.type);
}
