// wenyanwen 公共 API

import { parse } from './parser/block-parser.js';
import { renderBody } from './renderer/html-renderer.js';
import { renderPage } from './renderer/page-template.js';

/**
 * 编译 .wyw 源文本为完整 HTML 页面
 * @param {string} source - .wyw 文件内容
 * @param {Object} [options]
 * @param {boolean} [options.inline=false] - 内联 CSS/JS
 * @param {string} [options.assetsPath=''] - CSS/JS 资源路径前缀
 * @param {string} [options.theme='auto'] - 默认主题
 * @param {boolean} [options.showTranslation=true] - 默认显示译文
 * @returns {string} - 完整 HTML 页面
 */
export function compile(source, options = {}) {
  const doc = parse(source);
  const body = renderBody(doc);
  return renderPage({
    meta: doc.meta,
    body,
    inline: options.inline || false,
    assetsPath: options.assetsPath || '',
    theme: options.theme || 'auto',
    showTranslation: options.showTranslation !== false,
  });
}

export { parse } from './parser/block-parser.js';
export { renderBody } from './renderer/html-renderer.js';
export { renderPage } from './renderer/page-template.js';
