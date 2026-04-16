// 页面模板
// 生成完整的 HTML 页面，包装渲染好的 body 内容

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

/**
 * 生成完整的 HTML 页面
 * @param {Object} options
 * @param {Object} options.meta - 文档元数据
 * @param {string} options.body - 渲染后的 HTML body 内容
 * @param {boolean} [options.inline=false] - 是否内联 CSS/JS
 * @param {string} [options.assetsPath=''] - CSS/JS 资源路径前缀
 * @param {string} [options.theme='auto'] - 默认主题
 * @param {boolean} [options.showTranslation=true] - 默认显示译文
 * @returns {string}
 */
export function renderPage(options) {
  const {
    meta,
    body,
    inline = false,
    assetsPath = '',
    theme = 'auto',
    showTranslation = true,
  } = options;

  const title = meta.title
    ? `${meta.title}${meta.author ? ` — ${meta.author}` : ''}`
    : '文言文';

  const layoutClass = meta.layout || 'ancient';
  const articleClasses = `wyw wyw--${layoutClass} wyw--annotation${showTranslation ? '' : ' wyw--hide-translation'}`;

  let cssTag, jsTag;

  if (inline) {
    const css = readFileSync(join(ASSETS_DIR, 'wyw.css'), 'utf-8');
    const js = readFileSync(join(ASSETS_DIR, 'wyw.js'), 'utf-8');
    cssTag = `<style>\n${css}\n</style>`;
    jsTag = `<script>\n${js}\n</script>`;
  } else {
    cssTag = `<link rel="stylesheet" href="${assetsPath}wyw.css">`;
    jsTag = `<script src="${assetsPath}wyw.js"></script>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-Hans" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${cssTag}
</head>
<body>
  <article class="${articleClasses}">
    ${body}
  </article>
  ${jsTag}
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
