// 首页生成模块 — 词云布局 + HTML 模板

/**
 * 传统中式配色方案
 */
const COLORS = [
  'hsl(30, 10%, 20%)',   // 墨色
  'hsl(0, 65%, 48%)',    // 朱砂红
  'hsl(210, 20%, 38%)',  // 青灰
  'hsl(30, 25%, 35%)',   // 暖棕
  'hsl(40, 35%, 42%)',   // 哑金
  'hsl(0, 45%, 40%)',    // 暗红
  'hsl(200, 15%, 30%)',  // 深青
  'hsl(25, 20%, 28%)',   // 深棕
];

/**
 * 字号档位（em 单位）
 */
const FONT_SIZES = [2.2, 1.8, 1.5, 1.3, 1.1];

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
function overlaps(a, b, padding = 6) {
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
  const MAX_ITEMS = 40;
  const containerW = 900;
  const containerH = 700;
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
    // 少量标题加旋转（约 15%）
    item._rotation = rand() < 0.15 ? (rand() < 0.5 ? 90 : -90) : 0;
  });

  // 按字号从大到小排序（大的优先放置）
  items.sort((a, b) => b._fontSize - a._fontSize);

  // 先放置中心标题 "文言诗词" 的占位
  const centerTitle = '文言诗词';
  const centerBBox = estimateBBox(centerTitle, 3.6, containerW, containerH, 0);
  const placed = [{ x: centerX, y: centerY, w: centerBBox.w * 1.3, h: centerBBox.h * 1.3 }];

  const result = [];

  for (const item of items) {
    const bbox = estimateBBox(item.title, item._fontSize, containerW, containerH, item._rotation);

    let bestPos = null;
    // 阿基米德螺旋搜索
    const spiralStep = 0.5;
    const angleStep = 0.3;
    for (let t = 0; t < 360; t += spiralStep) {
      const angle = t * angleStep;
      const radius = 8 + t * 1.2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle) * 0.75; // 椭圆化，横向稍宽

      // 检查是否在容器内
      if (
        x - bbox.w / 2 < 10 ||
        x + bbox.w / 2 > containerW - 10 ||
        y - bbox.h / 2 < 10 ||
        y + bbox.h / 2 > containerH - 10
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

    const tooltip = [item.dynasty, item.author].filter(Boolean).join(' ');

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
 * @returns {string} - 完整 HTML 页面
 */
export function renderHomepage(layoutItems) {
  const cloudItems = layoutItems
    .map((item) => {
      const style = [
        `top: ${item.top}%`,
        `left: ${item.left}%`,
        `font-size: ${item.fontSize}em`,
        `color: ${item.color}`,
        'transform: translate(-50%, -50%)' +
          (item.rotation ? ` rotate(${item.rotation}deg)` : ''),
      ].join('; ');

      const titleAttr = item.tooltip ? ` title="${escapeAttr(item.tooltip)}"` : '';

      return `      <a class="wyw-cloud-item" href="${escapeAttr(item.href)}" style="${style}"${titleAttr}>${escapeHtml(item.title)}</a>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hans" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文言诗词</title>
  <link rel="stylesheet" href="wyw.css">
  <link rel="stylesheet" href="home.css">
</head>
<body>
  <main class="wyw-home">
    <div class="wyw-cloud" role="navigation" aria-label="作品列表">
      <h1 class="wyw-cloud-center">文言诗词</h1>
${cloudItems}
    </div>
    <footer class="wyw-home-footer">
      <p>文 &middot; 诗 &middot; 词</p>
    </footer>
  </main>
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
