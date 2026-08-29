const assert = require('assert');
const { computeFoldingRanges } = require('../out/folding.js');

const opts = { showClassLines: true };

function run(name, text, expected) {
  const lines = text.split('\n');
  const ranges = computeFoldingRanges(lines, opts).map((r) => [r.start, r.end]);
  assert.deepStrictEqual(ranges, expected, name);
  console.log(`PASS ${name}`);
}

run(
  'imports/comments/def',
  `import os
import sys

# 模块注释
VERSION = "1.0"

def main():
    # 第一步
    x = 1
    y = 2
    # 第二步
    return x + y

main()`,
  [
    [0, 1],
    [3, 4],
    [7, 9],
    [10, 13],
  ]
);

run(
  'class/nested-def/docstring',
  `class Foo:
    # 类注释
    value = 1

    def method(self):
        """docstring"""
        # 方法注释
        return self.value

# 模块注释
def outer():
    def inner():
        # 内层
        pass
    return inner`,
  [
    [1, 2],
    [4, 5],
    [6, 7],
    [12, 14],
  ]
);

run(
  'async-def',
  `async def fetch():
    # 请求
    return await api()

async def main():
    pass`,
  [
    [1, 2],
    [4, 5],
  ]
);

run(
  'decorator-single-line-stays-visible',
  `@staticmethod
def f(x):
    # hi
    return x`,
  [[2, 3]]
);

run(
  'triple-quoted-string-not-misparsed',
  `s = """abc
# not a comment
def fake():
"""
x = 1`,
  [[3, 4]]
);

run(
  'multi-line-docstring-stays-visible',
  `"""module docstring
second line
third line
"""
import os

def f():
    """doc
    more
    """
    # body
    x = 1`,
  [
    [3, 4],
    [10, 11],
  ]
);

run(
  'multi-line-import',
  `from package import (
    a,
    b,
)

def f():
    # c
    x = 1`,
  [
    [0, 3],
    [6, 7],
  ]
);

run(
  'blank-line-between-folded-sections',
  `# 第一部分
x = 1

# 第二部分
y = 2`,
  [
    [0, 1],
    [3, 4],
  ]
);

console.log('All tests passed.');
