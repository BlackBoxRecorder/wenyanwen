// 内联语法解析器
// 从左到右扫描文本，按优先级匹配内联标记

import {
  createText,
  createRuby,
  createAnnotate,
  createEmphasis,
  createRubyAnnotate,
} from "./ast.js";

// 内联语法的正则模式（按匹配优先级排列）
const PATTERNS = [
  // 注音+注释组合: [{字|拼音}{字}...](释义)
  {
    regex: /\[((?:\{[^}]+\})+)\]\(([^)]+)\)/,
    create: (match) => {
      const items = parseRubyBlocks(match[1]);
      return createRubyAnnotate(items, match[2]);
    },
  },
  // 注音: {字|pīn}
  {
    regex: /\{([^|{}]+)\|([^}]+)\}/,
    create: (match) => createRuby(match[1], match[2]),
  },
  // 注释: [词](释义)
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/,
    create: (match) => createAnnotate(match[1], match[2]),
  },
  // 着重: *文本*（不匹配两侧的 *，要求内容非空）
  {
    regex: /\*([^*]+)\*/,
    create: (match, parseInline) => createEmphasis(parseInline(match[1])),
  },
];

/**
 * 解析大括号块序列，如 "{穹|qióng}{庐}" -> [{base:'穹', annotation:'qióng'}, {base:'庐', annotation:null}]
 */
function parseRubyBlocks(str) {
  const items = [];
  for (const m of str.matchAll(/\{([^|{}]+)(?:\|([^}]+))?\}/g)) {
    items.push({ base: m[1], annotation: m[2] || null });
  }
  return items;
}

/**
 * 解析一段文本中的内联标记
 *
 * 算法：从左到右逐段扫描，每轮在剩余文本中查找所有模式中最早出现的匹配，
 * 将匹配前的文本作为纯文本节点、匹配部分交由对应模式的 create 函数生成 AST 节点，
 * 然后继续处理匹配之后的文本，直到全部文本被消费完毕。
 *
 * 支持的 4 种内联语法（按 PATTERNS 中的优先级排列）：
 *   1. 注音+注释组合: [{穹|qióng}{庐}](毡帐) → ruby_annotate 节点
 *   2. 注音:          {穹|qióng}               → ruby 节点
 *   3. 注释:          [词](释义)                → annotate 节点
 *   4. 着重:          *文本*                    → emphasis 节点（内部递归解析）
 *
 * @param {string} text - 待解析的文本（通常是一个段落的内联内容）
 * @returns {Array<import('./ast.js').InlineNode>} - Inline AST 节点数组
 */
export function parseInline(text) {
  // 空输入直接返回空数组
  if (!text) return [];

  const nodes = []; // 累积生成的 AST 节点
  let remaining = text; // 尚未处理的剩余文本

  while (remaining.length > 0) {
    // 每轮循环：在剩余文本中查找所有模式中最早出现的匹配
    let earliest = null; // 最早的匹配对象（RegExp match result）
    let earliestIndex = Infinity; // 最早匹配在 remaining 中的起始位置
    let earliestPattern = null; // 最早匹配对应的模式定义（含 regex 和 create）

    // 遍历所有模式，取位置最靠前的匹配（先到先得，而非按模式优先级抢占）
    for (const pattern of PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (match && match.index < earliestIndex) {
        earliest = match;
        earliestIndex = match.index;
        earliestPattern = pattern;
      }
    }

    if (!earliest) {
      // 没有更多内联标记匹配，将剩余文本整体作为纯文本节点
      nodes.push(createText(remaining));
      break;
    }

    // 匹配位置之前若有文本，生成纯文本节点保留
    if (earliestIndex > 0) {
      nodes.push(createText(remaining.slice(0, earliestIndex)));
    }

    // 调用匹配模式对应的 create 函数生成 AST 节点
    // 第二个参数传入 parseInline 自身，使着重号等模式可递归解析嵌套内容
    nodes.push(earliestPattern.create(earliest, parseInline));

    // 截断已处理部分（匹配位置 + 匹配全长），继续处理后续文本
    remaining = remaining.slice(earliestIndex + earliest[0].length);
  }

  return nodes;
}
