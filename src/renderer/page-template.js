// 页面模板
// 生成完整的 HTML 页面，包装渲染好的 body 内容

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplate, Handlebars } from "../templates/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "assets");

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
    assetsPath = "",
    theme = "auto",
    showTranslation = true,
  } = options;

  const title = meta.title
    ? `${stripWywMarkup(meta.title)}${meta.author ? ` — ${stripWywMarkup(meta.author)}` : ""}`
    : "文言文";

  const layoutClass = meta.layout || "ancient";
  const articleClasses = `wyw wyw--${layoutClass} wyw--annotation${showTranslation ? "" : " wyw--hide-translation"}`;

  let cssTag, jsTag;

  if (inline) {
    const css = readFileSync(join(ASSETS_DIR, "wyw.css"), "utf-8");
    const js = readFileSync(join(ASSETS_DIR, "wyw.js"), "utf-8");
    cssTag = `<style>\n${css}\n</style>`;
    jsTag = `<script>\n${js}\n</script>`;
  } else {
    cssTag = `<link rel="stylesheet" href="${assetsPath}wyw.css">`;
    jsTag = `<script src="${assetsPath}wyw.js"></script>`;
  }

  const template = loadTemplate("page");
  return template({
    title: escapeHtml(title),
    theme,
    articleClasses,
    body,
    cssTag: new Handlebars.SafeString(cssTag),
    jsTag: new Handlebars.SafeString(jsTag),
  });
}

function stripWywMarkup(text) {
  if (!text) return "";
  // 先剥离注音标记 {字|拼音}
  text = text.replace(/\{([^|{}]+)\|([^}]+)\}/g, "$1");
  // 再剥离注释标记 [词](释义)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  // 最后剥离着重标记 *文本*
  text = text.replace(/\*([^*]+)\*/g, "$1");
  return text;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
