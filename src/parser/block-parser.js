// 块级解析器
// 行级状态机：将文本行分类并组织为块级 AST 节点

import {
  createHeading,
  createParagraph,
  createTranslation,
  createParagraphGroup,
  createPoetryBlock,
  createBlockquote,
  createSectionBreak,
  createDocument,
  createProofreadDate,
} from './ast.js';
import { parseInline } from './inline-parser.js';
import { parseFrontmatter } from './frontmatter.js';

// 状态常量
const IDLE = 'IDLE';
const IN_PARAGRAPH = 'IN_PARAGRAPH';
const IN_TRANSLATION = 'IN_TRANSLATION';
const IN_FENCED = 'IN_FENCED';
const IN_BLOCKQUOTE = 'IN_BLOCKQUOTE';

/**
 * 解析完整的 .wyw 源文件
 * @param {string} source - .wyw 文件内容
 * @returns {Object} - Document AST 节点
 */
export function parse(source) {
  const { meta, body } = parseFrontmatter(source);
  const lines = body.split('\n');
  const blocks = parseBlocks(lines);
  const grouped = groupParagraphs(blocks);
  return createDocument(meta, grouped);
}

/**
 * 将文本行解析为块级节点
 *
 * 核心功能：
 * 这是一个基于有限状态机（Finite State Machine）的块级解析器，
 * 负责将输入的文本行数组逐行处理，识别不同的块级结构（如标题、段落、
 * 译文、引用、围栏块等），并生成对应的 AST（抽象语法树）节点。
 *
 * 状态说明：
 * - IDLE: 空闲状态，等待识别新的块级元素
 * - IN_PARAGRAPH: 正在累积普通段落内容
 * - IN_TRANSLATION: 正在累积译文内容（以 >> 开头的行）
 * - IN_FENCED: 正在处理围栏块（::: 包裹的内容，用于诗词等）
 * - IN_BLOCKQUOTE: 正在累积引用内容（以 > 开头的行）
 *
 * 处理流程：
 * 1. 逐行遍历输入文本
 * 2. 根据当前状态和行内容决定如何处理
 * 3. 使用 buffer 累积多行内容，遇到边界时 flush 生成节点
 * 4. 文件末尾时 flush 所有未处理的内容
 *
 * @param {string[]} lines - 按行分割的文本数组
 * @returns {Object[]} - 块级 AST 节点数组
 */
function parseBlocks(lines) {
  // blocks: 存储最终生成的所有块级 AST 节点
  const blocks = [];

  // state: 当前解析状态，决定如何处理每一行
  let state = IDLE;

  // buffer: 临时缓冲区，用于累积多行内容（段落、译文、引用、围栏块等）
  let buffer = [];

  // 围栏块相关变量
  let fencedType = ''; // 围栏块类型（如 poetry）
  let fencedMeta = null; // 围栏块元信息（:: 开头的行）
  let fencedTitle = null; // 围栏块标题（# 开头的行）

  /**
   * 刷新段落缓冲区
   * 将 buffer 中累积的文本合并为单个字符串，创建 paragraph 节点
   * 使用 parseInline 对文本进行内联解析（处理注音、注释等）
   */
  function flushParagraph() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createParagraph(parseInline(text)));
      buffer = [];
    }
  }

  /**
   * 刷新译文缓冲区
   * 将 buffer 中累积的译文文本合并，创建 translation 节点
   * 译文以 >> 开头，用于现代汉语翻译
   */
  function flushTranslation() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createTranslation(parseInline(text)));
      buffer = [];
    }
  }

  /**
   * 刷新引用缓冲区
   * 将 buffer 中累积的引用文本合并，创建 blockquote 节点
   * 引用以 > 开头（但不包括 >> 译文）
   */
  function flushBlockquote() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createBlockquote(parseInline(text)));
      buffer = [];
    }
  }

  /**
   * 刷新围栏块缓冲区
   * 将 buffer 中的每一行分别进行内联解析，创建 poetry_block 节点
   * 围栏块用于诗词等特殊格式，每行独立解析保留换行结构
   */
  function flushFenced() {
    const poetryLines = buffer.map((line) => parseInline(line));
    blocks.push(createPoetryBlock(fencedTitle, fencedMeta, poetryLines));
    buffer = [];
    fencedType = '';
    fencedMeta = null;
    fencedTitle = null;
  }

  // 主循环：逐行处理输入文本
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 对于当前行，根据当前状态分发处理逻辑
    switch (state) {
      // ==================== IDLE 状态 ====================
      // 空闲状态：等待识别新的块级元素起始标记
      case IDLE: {
        // 跳过空行
        if (trimmed === '') {
          continue;
        }

        // 主题分隔线: ---（三个或更多连字符）
        if (/^-{3,}$/.test(trimmed)) {
          blocks.push(createSectionBreak());
          continue;
        }

        // 校对日期标记: --YYYY 年 M 月 D 日--
        // 格式：--2024 年 1 月 15 日--
        const dateMatch = trimmed.match(/^--(\d{4} 年 \d{1,2} 月 \d{1,2} 日)--$/);
        if (dateMatch) {
          blocks.push(createProofreadDate(dateMatch[1]));
          continue;
        }

        // 标题: # text（支持 1-3 级标题）
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length; // # 的数量即标题级别
          const content = headingMatch[2];
          blocks.push(createHeading(level, parseInline(content)));
          continue;
        }

        // 围栏块开始: ::: type（默认类型为 poetry）
        if (trimmed.startsWith(':::')) {
          fencedType = trimmed.slice(3).trim() || 'poetry';
          state = IN_FENCED;
          buffer = [];
          fencedMeta = null;
          fencedTitle = null;
          continue;
        }

        // 译文: >> text（现代汉语翻译）
        if (trimmed.startsWith('>>')) {
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          state = IN_TRANSLATION;
          continue;
        }

        // 引用: > text（注意：>> 已被译文处理，这里排除）
        if (trimmed.startsWith('>') && !trimmed.startsWith('>>')) {
          const content = trimmed.slice(1).trim();
          buffer.push(content);
          state = IN_BLOCKQUOTE;
          continue;
        }

        // 普通段落开始：没有特殊标记的行
        buffer.push(trimmed);
        state = IN_PARAGRAPH;
        break;
      }

      // ==================== IN_PARAGRAPH 状态 ====================
      // 正在累积普通段落内容
      case IN_PARAGRAPH: {
        // 空行表示段落结束
        if (trimmed === '') {
          flushParagraph();
          state = IDLE;
          continue;
        }

        // 遇到译文行，先 flush 当前段落，然后切换到译文状态
        if (trimmed.startsWith('>>')) {
          flushParagraph();
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          state = IN_TRANSLATION;
          continue;
        }

        // 继续累积段落行（多行合并为一个段落）
        buffer.push(trimmed);
        break;
      }

      // ==================== IN_TRANSLATION 状态 ====================
      // 正在累积译文内容
      case IN_TRANSLATION: {
        // 继续累积以 >> 开头的行
        if (trimmed.startsWith('>>')) {
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          continue;
        }

        // 遇到非 >> 行，译文结束，flush 译文并重置状态
        flushTranslation();
        state = IDLE;
        // i-- 让外层循环重新处理当前行（它可能属于其他块）
        i--;
        break;
      }

      // ==================== IN_FENCED 状态 ====================
      // 正在处理围栏块（::: 包裹的内容）
      case IN_FENCED: {
        // 围栏结束标记 :::
        if (trimmed === ':::') {
          flushFenced();
          state = IDLE;
          continue;
        }

        // 围栏内的标题：# text（必须在围栏开始后的第一行，且只能有一个）
        const fencedHeadingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (fencedHeadingMatch && buffer.length === 0 && !fencedTitle) {
          fencedTitle = parseInline(fencedHeadingMatch[2]);
          continue;
        }

        // 围栏内的元信息：:: text（注意：::: 是结束标记，这里排除）
        if (trimmed.startsWith('::') && !trimmed.startsWith(':::')) {
          fencedMeta = trimmed.slice(2).trim();
          continue;
        }

        // 处理围栏内的内容行
        if (trimmed !== '') {
          // 非空行直接加入 buffer
          buffer.push(trimmed);
        } else if (buffer.length > 0) {
          // 保留段落间的空行（但只在已有内容后）
          buffer.push('');
        }
        break;
      }

      // ==================== IN_BLOCKQUOTE 状态 ====================
      // 正在累积引用内容
      case IN_BLOCKQUOTE: {
        // 继续累积以 > 开头的行（排除 >> 译文）
        if (trimmed.startsWith('>') && !trimmed.startsWith('>>')) {
          const content = trimmed.slice(1).trim();
          buffer.push(content);
          continue;
        }

        // 遇到非引用行，引用结束
        flushBlockquote();
        state = IDLE;
        // i-- 重新处理当前行
        i--;
        break;
      }
    }
  }

  // ==================== 文件末尾处理 ====================
  // 循环结束后，flush 所有可能未处理的内容
  switch (state) {
    case IN_PARAGRAPH:
      flushParagraph();
      break;
    case IN_TRANSLATION:
      flushTranslation();
      break;
    case IN_BLOCKQUOTE:
      flushBlockquote();
      break;
    case IN_FENCED:
      flushFenced();
      break;
  }

  return blocks;
}

/**
 * 将相邻的 paragraph + translation 合并为 paragraph_group
 */
function groupParagraphs(blocks) {
  const result = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.type === 'paragraph') {
      // 检查下一个是否为 translation
      const next = blocks[i + 1];
      if (next && next.type === 'translation') {
        result.push(createParagraphGroup(block, next));
        i++; // 跳过 translation
      } else {
        result.push(createParagraphGroup(block, null));
      }
    } else if (block.type === 'translation') {
      // 孤立的 translation（前面没有 paragraph），包装成 group
      result.push(createParagraphGroup(null, block));
    } else {
      result.push(block);
    }
  }

  return result;
}
