#!/usr/bin/env node
// 静态站点构建脚本
// 扫描 wywdocs/ 下的 .wyw 文件，生成首页词云和详情页

import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, parse } from '../src/index.js';
import { computeWordCloudLayout, renderHomepage } from './homepage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WYWDOCS = join(ROOT, 'wywdocs');
const DIST = join(ROOT, 'dist');
const ASSETS_DIR = join(ROOT, 'src', 'assets');
const CATEGORIES = ['wen', 'shi', 'ci'];

/**
 * 扫描 wywdocs 各子目录下的 .wyw 文件
 * @returns {Array<{ category: string, slug: string, filePath: string }>}
 */
function scanFiles() {
  const files = [];
  for (const cat of CATEGORIES) {
    const dir = join(WYWDOCS, cat);
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir).filter((f) => f.endsWith('.wyw'));
    for (const entry of entries) {
      files.push({
        category: cat,
        slug: basename(entry, '.wyw'),
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
    const source = readFileSync(f.filePath, 'utf-8');
    const doc = parse(source);
    return {
      title: doc.meta.title || f.slug,
      author: doc.meta.author || '',
      dynasty: doc.meta.dynasty || '',
      category: f.category,
      slug: f.slug,
      href: `${f.category}/${f.slug}.html`,
      filePath: f.filePath,
    };
  });
}

/**
 * 在编译后的 HTML 中注入返回首页的导航链接
 */
function injectBackLink(html) {
  const navHtml = '\n    <nav class="wyw-nav"><a href="../index.html" class="wyw-back">\u2190 首页</a></nav>';
  // 在 <article ...> 标签后面插入
  return html.replace(/(<article[^>]*>)/, `$1${navHtml}`);
}

/**
 * 主构建流程
 */
function build() {
  console.log('构建文言诗词网站...\n');

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
    console.log('未找到 .wyw 文件，请在 wywdocs/{wen,shi,ci}/ 目录下添加文件。');
    return;
  }
  console.log(`发现 ${files.length} 个 .wyw 文件`);

  // 3. 构建清单
  const manifest = buildManifest(files);

  // 4. 生成详情页
  let pageCount = 0;
  for (const item of manifest) {
    const source = readFileSync(item.filePath, 'utf-8');
    let html = compile(source, { assetsPath: '../' });
    html = injectBackLink(html);
    const outPath = join(DIST, item.category, `${item.slug}.html`);
    writeFileSync(outPath, html, 'utf-8');
    console.log(`  ${item.category}/${item.slug}.html  (${item.title})`);
    pageCount++;
  }

  // 5. 生成首页
  const layoutItems = computeWordCloudLayout(manifest);
  const homepageHtml = renderHomepage(layoutItems);
  writeFileSync(join(DIST, 'index.html'), homepageHtml, 'utf-8');
  console.log(`  index.html  (首页词云, ${layoutItems.length} 个标题)`);

  // 6. 复制资源文件
  cpSync(join(ASSETS_DIR, 'wyw.css'), join(DIST, 'wyw.css'));
  cpSync(join(ASSETS_DIR, 'wyw.js'), join(DIST, 'wyw.js'));
  cpSync(join(__dirname, 'home.css'), join(DIST, 'home.css'));

  console.log(`\n构建完成: ${pageCount} 个详情页 + 1 个首页 → dist/`);
}

build();
