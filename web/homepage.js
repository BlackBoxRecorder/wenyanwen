// 首页生成模块 — 标签页布局 + HTML 模板

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");

function loadTemplate(name) {
  const templatePath = join(TEMPLATES_DIR, `${name}.hbs`);
  const source = readFileSync(templatePath, "utf-8");
  return Handlebars.compile(source);
}

// 标签页配色
const TAB_COLORS = [
  "hsl(30, 10%, 20%)",
  "hsl(0, 65%, 48%)",
  "hsl(210, 20%, 38%)",
  "hsl(30, 25%, 35%)",
  "hsl(40, 35%, 42%)",
  "hsl(0, 45%, 40%)",
  "hsl(200, 15%, 30%)",
  "hsl(25, 20%, 28%)",
];

/**
 * 生成首页完整 HTML
 * @param {Array} manifest - 完整文档清单
 * @returns {string} - 完整 HTML 页面
 */
export function renderHomepage(manifest) {
  // 按分类分组
  const categories = ["wen", "shi", "ci"];
  const tabNames = { wen: "文", shi: "诗", ci: "词" };
  const grouped = {};
  for (const cat of categories) {
    grouped[cat] = manifest.filter((item) => item.category === cat);
  }

  // 标签页导航数据
  const tabNavItems = categories.map((cat, index) => ({
    tab: cat,
    label: tabNames[cat],
    active: index === 0,
  }));

  // 标签页内容数据
  const tabContents = categories.map((cat, index) => {
    const items = grouped[cat].map((item, i) => ({
      title: item.title,
      href: item.href,
      color: TAB_COLORS[i % TAB_COLORS.length],
    }));
    return {
      tab: cat,
      active: index === 0,
      items,
    };
  });

  // 搜索数据（精简的 manifest，供前端搜索使用）
  const searchItems = manifest.map((item) => ({
    title: item.title,
    href: item.href,
    author: item.author || "",
    dynasty: item.dynasty || "",
  }));

  const template = loadTemplate("homepage");
  return template({
    tabNavItems,
    tabContents,
    searchItems: JSON.stringify(searchItems),
  });
}
