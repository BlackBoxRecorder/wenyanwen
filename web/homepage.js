// 首页生成模块 — 词云布局 + HTML 模板

import { loadTemplate } from "../src/templates/index.js";

/**
 * 传统中式配色方案
 */
const COLORS = [
  "hsl(30, 10%, 20%)", // 墨色
  "hsl(0, 65%, 48%)", // 朱砂红
  "hsl(210, 20%, 38%)", // 青灰
  "hsl(30, 25%, 35%)", // 暖棕
  "hsl(40, 35%, 42%)", // 哑金
  "hsl(0, 45%, 40%)", // 暗红
  "hsl(200, 15%, 30%)", // 深青
  "hsl(25, 20%, 28%)", // 深棕
];

/**
 * 字号档位（em 单位）
 */
const FONT_SIZES = [
  1.9, 1.6, 1.35, 1.15, 0.95, 0.82, 0.72, 0.64, 0.56, 0.5, 0.45, 0.4,
];

/**
 * 简易伪随机数生成器（确保构建结果确定性）
 */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * 估算文本包围盒（像素单位，基于 containerWidth）
 * CJK 字符近似等宽
 */
function estimateBBox(text, fontSize, containerW, containerH, rotation) {
  const charCount = [...text].length;
  // fontSize 是 em 单位，基准按容器宽度的 1/50
  const basePx = containerW / 50;
  const fontPx = fontSize * basePx;
  let w = charCount * fontPx * 1.15;
  let h = fontPx * 1.6;
  // 旋转 90° 时交换宽高
  if (Math.abs(rotation) > 45) {
    [w, h] = [h, w];
  }
  return { w, h };
}

/**
 * 检查两个矩形是否重叠（带间距）
 */
function overlaps(a, b, padding = 1) {
  return !(
    a.x + a.w / 2 + padding < b.x - b.w / 2 ||
    a.x - a.w / 2 - padding > b.x + b.w / 2 ||
    a.y + a.h / 2 + padding < b.y - b.h / 2 ||
    a.y - a.h / 2 - padding > b.y + b.h / 2
  );
}

/**
 * 计算词云布局
 * @param {Array} manifest - [{ title, href, category, author, dynasty }]
 * @returns {Array} - [{ title, href, top, left, fontSize, color, rotation, tooltip }]
 */
export function computeWordCloudLayout(manifest) {
  const MAX_ITEMS = 100;
  const containerW = 1200;
  const containerH = 900;
  const centerX = containerW / 2;
  const centerY = containerH / 2;

  const rand = seededRandom(42);

  // 选取子集（如果太多）
  let items = [...manifest];
  if (items.length > MAX_ITEMS) {
    items.sort(() => rand() - 0.5);
    items = items.slice(0, MAX_ITEMS);
  }

  // 为每项分配字号和颜色
  items.forEach((item, i) => {
    item._fontSize = FONT_SIZES[i % FONT_SIZES.length];
    item._color = COLORS[i % COLORS.length];
    // 所有文字统一横排，不旋转
    item._rotation = 0;
  });

  // 按字号从大到小排序（大的优先放置）
  items.sort((a, b) => b._fontSize - a._fontSize);

  // 先放置中心标题 "文言诗词" 的占位
  const centerTitle = "文言诗词";
  const centerBBox = estimateBBox(centerTitle, 3.6, containerW, containerH, 0);
  const placed = [{ x: centerX, y: centerY, w: centerBBox.w, h: centerBBox.h }];

  const result = [];

  for (const item of items) {
    const bbox = estimateBBox(
      item.title,
      item._fontSize,
      containerW,
      containerH,
      item._rotation,
    );

    let bestPos = null;
    // 阿基米德螺旋搜索
    const spiralStep = 0.03;
    const angleStep = 0.03;
    for (let t = 0; t < 100000; t += spiralStep) {
      const angle = t * angleStep;
      const radius = 0.5 + t * 0.18;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle) * 0.75; // 椭圆化，横向稍宽

      // 检查是否在容器内（放宽边界）
      if (
        x - bbox.w / 2 < 0 ||
        x + bbox.w / 2 > containerW ||
        y - bbox.h / 2 < 0 ||
        y + bbox.h / 2 > containerH
      ) {
        continue;
      }

      const candidate = { x, y, w: bbox.w, h: bbox.h };
      let hasOverlap = false;
      for (const p of placed) {
        if (overlaps(candidate, p)) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        bestPos = candidate;
        break;
      }
    }

    if (!bestPos) {
      // 找不到位置，跳过
      continue;
    }

    placed.push(bestPos);

    // 转为百分比
    const topPct = ((bestPos.y / containerH) * 100).toFixed(1);
    const leftPct = ((bestPos.x / containerW) * 100).toFixed(1);

    const tooltip = [item.dynasty, item.author].filter(Boolean).join(" ");

    result.push({
      title: item.title,
      href: item.href,
      top: topPct,
      left: leftPct,
      fontSize: item._fontSize,
      color: item._color,
      rotation: item._rotation,
      tooltip,
    });
  }

  return result;
}

/**
 * 生成首页完整 HTML
 * @param {Array} layoutItems - computeWordCloudLayout 的输出
 * @param {Array} manifest - 完整文档清单
 * @returns {string} - 完整 HTML 页面
 */
export function renderHomepage(layoutItems, manifest) {
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
      color: COLORS[i % COLORS.length],
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
    cloudItems: layoutItems,
    tabNavItems,
    tabContents,
    searchItems: JSON.stringify(searchItems),
  });
}
