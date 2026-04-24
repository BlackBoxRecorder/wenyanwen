#!/usr/bin/env node
// 静态站点构建脚本
// 扫描 wywdocs/ 下的 .wyw 文件，生成首页词云和详情页

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, parse } from "../src/index.js";
import { computeWordCloudLayout, renderHomepage } from "./homepage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WYWDOCS = join(ROOT, "wywdocs");
const DIST = join(ROOT, "dist");
const ASSETS_DIR = join(ROOT, "src", "assets");
const CATEGORIES = ["wen", "shi", "ci"];

/**
 * 扫描 wywdocs 各子目录下的 .wyw 文件
 * @returns {Array<{ category: string, slug: string, filePath: string }>}
 */
function scanFiles() {
  const files = [];
  for (const cat of CATEGORIES) {
    const dir = join(WYWDOCS, cat);
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir).filter((f) => f.endsWith(".wyw"));
    for (const entry of entries) {
      files.push({
        category: cat,
        slug: basename(entry, ".wyw"),
        filePath: join(dir, entry),
      });
    }
  }
  return files;
}

/**
 * 解析文件元数据，构建清单
 */
function buildManifest(files) {
  return files.map((f) => {
    const source = readFileSync(f.filePath, "utf-8");
    const doc = parse(source);
    return {
      title: doc.meta.title || f.slug,
      author: doc.meta.author || "",
      dynasty: doc.meta.dynasty || "",
      category: f.category,
      slug: f.slug,
      href: `${f.category}/${f.slug}.html`,
      filePath: f.filePath,
    };
  });
}

/**
 * 在编译后的 HTML 中注入导航（返回首页 + 上/下篇）
 * @param {string} html - 编译后的 HTML
 * @param {Object|null} prev - 上一篇 { title, href } 或 null
 * @param {Object|null} next - 下一篇 { title, href } 或 null
 */
function injectNavigation(html, prev, next) {
  // 顶部导航：返回首页
  const navHtml =
    '\n    <nav class="wyw-nav"><a href="../index.html" class="wyw-back">\u2190 首页</a></nav>';
  let result = html.replace(/(<article[^>]*>)/, `$1${navHtml}`);

  // 底部导航：上一篇 / 下一篇
  if (prev || next) {
    const prevNextHtml = buildPrevNextHtml(prev, next);
    // 在 </article> 之前插入
    result = result.replace(/(<\/article>)/, `${prevNextHtml}\n$1`);
  }

  return result;
}

/**
 * 构建上/下篇导航 HTML
 */
function buildPrevNextHtml(prev, next) {
  const parts = ['\n    <nav class="wyw-prev-next">'];

  if (prev) {
    parts.push(
      `      <a class="wyw-prev" href="${escapeAttr(prev.href)}"><span class="wyw-prev-next-label">\u2190 上一篇</span><span class="wyw-prev-next-title">${escapeHtml(prev.title)}</span></a>`,
    );
  } else {
    parts.push('      <span class="wyw-prev wyw-prev-next--disabled"></span>');
  }

  if (next) {
    parts.push(
      `      <a class="wyw-next" href="${escapeAttr(next.href)}"><span class="wyw-prev-next-label">下一篇 \u2192</span><span class="wyw-prev-next-title">${escapeHtml(next.title)}</span></a>`,
    );
  } else {
    parts.push('      <span class="wyw-next wyw-prev-next--disabled"></span>');
  }

  parts.push("    </nav>");
  return parts.join("\n");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 主构建流程
 */
function build() {
  console.log("构建文言诗词网站...\n");

  // 1. 清理并创建 dist 目录
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });
  for (const cat of CATEGORIES) {
    mkdirSync(join(DIST, cat), { recursive: true });
  }

  // 2. 扫描文件
  const files = scanFiles();
  if (files.length === 0) {
    console.log(
      "未找到 .wyw 文件，请在 wywdocs/{wen,shi,ci}/ 目录下添加文件。",
    );
    return;
  }
  console.log(`发现 ${files.length} 个 .wyw 文件`);

  // 3. 构建清单
  const manifest = buildManifest(files);

  // 4. 生成详情页
  let pageCount = 0;
  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    const source = readFileSync(item.filePath, "utf-8");
    let html = compile(source, { assetsPath: "../" });

    const prevItem =
      i > 0
        ? { title: manifest[i - 1].title, href: `../${manifest[i - 1].href}` }
        : null;
    const nextItem =
      i < manifest.length - 1
        ? { title: manifest[i + 1].title, href: `../${manifest[i + 1].href}` }
        : null;
    html = injectNavigation(html, prevItem, nextItem);

    const outPath = join(DIST, item.category, `${item.slug}.html`);
    writeFileSync(outPath, html, "utf-8");
    console.log(`  ${item.category}/${item.slug}.html  (${item.title})`);
    pageCount++;
  }

  // 5. 生成首页
  const layoutItems = computeWordCloudLayout(manifest);
  const homepageHtml = renderHomepage(layoutItems, manifest);
  writeFileSync(join(DIST, "index.html"), homepageHtml, "utf-8");
  console.log(`  index.html  (首页词云, ${layoutItems.length} 个标题)`);

  // 6. 复制资源文件
  cpSync(join(ASSETS_DIR, "wyw.css"), join(DIST, "wyw.css"));
  cpSync(join(ASSETS_DIR, "wyw.js"), join(DIST, "wyw.js"));
  cpSync(join(__dirname, "home.css"), join(DIST, "home.css"));
  cpSync(join(ASSETS_DIR, "cloud.png"), join(DIST, "cloud.png"));
  cpSync(join(ASSETS_DIR, "list.png"), join(DIST, "list.png"));

  console.log(`\n构建完成: ${pageCount} 个详情页 + 1 个首页 → dist/`);
}

build();
