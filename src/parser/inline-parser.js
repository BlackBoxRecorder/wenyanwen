// 内联语法解析器
// 从左到右扫描文本，按优先级匹配内联标记

import {
  createText,
  createRuby,
  createAnnotate,
  createEmphasis,
  createProperNoun,
  createBookTitle,
  createRubyAnnotate,
  createRubyAnnotateFull,
} from './ast.js';

// 内联语法的正则模式（按匹配优先级排列）
const PATTERNS = [
  // 注音+注释整词组合: {字|pīn yīn|整词}(释义)
  {
    regex: /\{([^|{}]+)\|([^|{}]+)\|([^}]+)\}\(([^)]+)\)/,
    create: (match) => createRubyAnnotateFull(match[1], match[2], match[3], match[4]),
  },
  // 注音+注释组合: {字|pīn yīn}[字](释义)
  {
    regex: /\{([^|{}]+)\|([^}]+)\}\[\1\]\(([^)]+)\)/,
    create: (match) => createRubyAnnotate(match[1], match[2], match[3]),
  },
  // 注音: {字|pīn yīn}
  {
    regex: /\{([^|{}]+)\|([^}]+)\}/,
    create: (match) => createRuby(match[1], match[2]),
  },
  // 注释: [词](释义)
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/,
    create: (match) => createAnnotate(match[1], match[2]),
  },
  // 书名: 《书名》
  {
    regex: /《([^》]+)》/,
    create: (match) => createBookTitle(match[1]),
  },
  // 着重: *文本*（不匹配两侧的 *，要求内容非空）
  {
    regex: /\*([^*]+)\*/,
    create: (match, parseInline) => createEmphasis(parseInline(match[1])),
  },
  // 专名: _文本_（下划线包裹）
  {
    regex: /_([^_]+)_/,
    create: (match, parseInline) => createProperNoun(parseInline(match[1])),
  },
];

/**
 * 解析一段文本中的内联标记
 * @param {string} text - 待解析的文本
 * @returns {Array} - Inline AST 节点数组
 */
export function parseInline(text) {
  if (!text) return [];

  const nodes = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 在剩余文本中查找最早出现的匹配
    let earliest = null;
    let earliestIndex = Infinity;
    let earliestPattern = null;

    for (const pattern of PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (match && match.index < earliestIndex) {
        earliest = match;
        earliestIndex = match.index;
        earliestPattern = pattern;
      }
    }

    if (!earliest) {
      // 没有更多匹配，剩余全部为纯文本
      nodes.push(createText(remaining));
      break;
    }

    // 匹配之前的纯文本
    if (earliestIndex > 0) {
      nodes.push(createText(remaining.slice(0, earliestIndex)));
    }

    // 创建匹配的节点（传入递归解析函数给需要嵌套解析的模式）
    nodes.push(earliestPattern.create(earliest, parseInline));

    // 继续处理匹配之后的文本
    remaining = remaining.slice(earliestIndex + earliest[0].length);
  }

  return nodes;
}
