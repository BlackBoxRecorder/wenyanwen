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
 */
function parseBlocks(lines) {
  const blocks = [];
  let state = IDLE;
  let buffer = [];
  let fencedType = '';
  let fencedMeta = null;
  let fencedTitle = null;

  function flushParagraph() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createParagraph(parseInline(text)));
      buffer = [];
    }
  }

  function flushTranslation() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createTranslation(parseInline(text)));
      buffer = [];
    }
  }

  function flushBlockquote() {
    if (buffer.length > 0) {
      const text = buffer.join('');
      blocks.push(createBlockquote(parseInline(text)));
      buffer = [];
    }
  }

  function flushFenced() {
    const poetryLines = buffer.map((line) => parseInline(line));
    blocks.push(createPoetryBlock(fencedTitle, fencedMeta, poetryLines));
    buffer = [];
    fencedType = '';
    fencedMeta = null;
    fencedTitle = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    switch (state) {
      case IDLE: {
        if (trimmed === '') {
          continue;
        }

        // 主题分隔线: ---
        if (/^-{3,}$/.test(trimmed)) {
          blocks.push(createSectionBreak());
          continue;
        }

        // 标题: # text
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const content = headingMatch[2];
          blocks.push(createHeading(level, parseInline(content)));
          continue;
        }

        // 围栏块: ::: type
        if (trimmed.startsWith(':::')) {
          fencedType = trimmed.slice(3).trim() || 'poetry';
          state = IN_FENCED;
          buffer = [];
          fencedMeta = null;
          fencedTitle = null;
          continue;
        }

        // 译文: >> text
        if (trimmed.startsWith('>>')) {
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          state = IN_TRANSLATION;
          continue;
        }

        // 引用: > text
        if (trimmed.startsWith('>') && !trimmed.startsWith('>>')) {
          const content = trimmed.slice(1).trim();
          buffer.push(content);
          state = IN_BLOCKQUOTE;
          continue;
        }

        // 普通段落开始
        buffer.push(trimmed);
        state = IN_PARAGRAPH;
        break;
      }

      case IN_PARAGRAPH: {
        if (trimmed === '') {
          flushParagraph();
          state = IDLE;
          continue;
        }

        // 遇到译文行，先 flush 段落
        if (trimmed.startsWith('>>')) {
          flushParagraph();
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          state = IN_TRANSLATION;
          continue;
        }

        // 继续累积段落行
        buffer.push(trimmed);
        break;
      }

      case IN_TRANSLATION: {
        if (trimmed.startsWith('>>')) {
          const content = trimmed.slice(2).trim();
          buffer.push(content);
          continue;
        }

        // 遇到非 >> 行，flush 译文
        flushTranslation();
        state = IDLE;
        // 重新处理当前行
        i--;
        break;
      }

      case IN_FENCED: {
        // 结束围栏
        if (trimmed === ':::') {
          flushFenced();
          state = IDLE;
          continue;
        }

        // 围栏内的标题 # text
        const fencedHeadingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (fencedHeadingMatch && buffer.length === 0 && !fencedTitle) {
          fencedTitle = fencedHeadingMatch[2];
          continue;
        }

        // 围栏内的元信息 :: text
        if (trimmed.startsWith('::') && !trimmed.startsWith(':::')) {
          fencedMeta = trimmed.slice(2).trim();
          continue;
        }

        // 跳过围栏内的空行（保留非空行）
        if (trimmed !== '') {
          buffer.push(trimmed);
        } else if (buffer.length > 0) {
          buffer.push(''); // 保留段落间的空行
        }
        break;
      }

      case IN_BLOCKQUOTE: {
        if (trimmed.startsWith('>') && !trimmed.startsWith('>>')) {
          const content = trimmed.slice(1).trim();
          buffer.push(content);
          continue;
        }

        flushBlockquote();
        state = IDLE;
        i--;
        break;
      }
    }
  }

  // 处理文件末尾未 flush 的内容
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
