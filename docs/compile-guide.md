# .wyw 转 HTML 编译原理

本文档详细说明 `.wyw` 文件是如何被编译为 HTML 页面的，涵盖完整的编译流水线、数据结构与渲染逻辑。

---

## 整体架构

编译过程采用经典的 **三段式编译器** 架构：源文本 → AST → HTML。

```
.wyw 源文件
    │
    ▼
┌─────────────────────┐
│  parse(source)       │  解析阶段：源文本 → AST
│  ├ parseFrontmatter  │
│  ├ parseBlocks       │
│  └ groupParagraphs   │
└─────────┬───────────┘
          │  Document AST
          ▼
┌─────────────────────┐
│  renderBody(doc)     │  渲染阶段：AST → HTML body
│  ├ renderBlock       │
│  └ renderInline      │
└─────────┬───────────┘
          │  HTML body 字符串
          ▼
┌─────────────────────┐
│  renderPage(options) │  页面组装：body → 完整 HTML 页面
│  └ Handlebars 模板   │
└─────────────────────┘
          │
          ▼
    完整 HTML 文件
```

入口函数是 [compile()](src/index.js)，它串联三个阶段：

```js
export function compile(source, options = {}) {
  const doc = parse(source);        // 阶段一：解析
  const body = renderBody(doc);     // 阶段二：渲染
  return renderPage({               // 阶段三：页面组装
    meta: doc.meta, body,
    inline: options.inline || false,
    assetsPath: options.assetsPath || '',
    theme: options.theme || 'auto',
    showTranslation: options.showTranslation !== false,
  });
}
```

---

## 阶段一：解析（Parse）

解析阶段将 `.wyw` 源文本转换为 Document AST，由 [block-parser.js](src/parser/block-parser.js) 的 `parse()` 函数完成。该阶段细分为三步：

### 1.1 Frontmatter 解析

**文件：** [frontmatter.js](src/parser/frontmatter.js)

`parseFrontmatter()` 从源文本开头提取 YAML 格式的元数据：

```
输入：
---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
---

山不在高...

输出：
{
  meta: { title: '陋室铭', author: '刘禹锡', dynasty: '唐', source: '', layout: 'ancient' },
  body: '山不在高...'
}
```

**实现逻辑：**
1. 检查源文本是否以 `---` 开头
2. 查找结束标记 `\n---`
3. 提取中间的 YAML 文本，逐行按 `key: value` 解析
4. 未提供的前端字段使用默认值（`title: ''`, `author: ''`, `dynasty: ''`, `source: ''`, `layout: 'ancient'`）
5. 返回 `{ meta, body }`，其中 `body` 是去掉 frontmatter 后的剩余文本

若源文本不以 `---` 开头或未闭合，则返回默认 meta 并原样返回 body。

### 1.2 块级解析（状态机）

**文件：** [block-parser.js](src/parser/block-parser.js) → `parseBlocks()`

`parseBlocks()` 使用**有限状态机**逐行扫描 body 文本，将行分类并组装为块级 AST 节点。

#### 状态定义

| 状态 | 含义 |
|------|------|
| `IDLE` | 空闲，等待新块开始 |
| `IN_PARAGRAPH` | 正在累积段落行 |
| `IN_TRANSLATION` | 正在累积译文行 |
| `IN_FENCED` | 正在围栏块（`:::`）内 |
| `IN_BLOCKQUOTE` | 正在累积引用行 |

#### 行匹配规则

状态机在 `IDLE` 状态下按优先级匹配行首标记：

| 行首标记 | 产生的块节点 | 状态转换 |
|----------|-------------|----------|
| `---`（3+连字符） | `section_break` | 保持 IDLE |
| `--YYYY 年 M 月 D 日--` | `proofread_date` | 保持 IDLE |
| `#` / `##` / `###` | `heading` | 保持 IDLE |
| `:::` | 开始围栏 | → IN_FENCED |
| `>>` | `translation` | → IN_TRANSLATION |
| `>` | `blockquote` | → IN_BLOCKQUOTE |
| 其他非空行 | `paragraph` | → IN_PARAGRAPH |
| 空行 | 无 | 保持 IDLE |

#### 状态转换详解

```
IDLE ──普通行──→ IN_PARAGRAPH
IDLE ──>> 行──→ IN_TRANSLATION
IDLE ──> 行───→ IN_BLOCKQUOTE
IDLE ──::: 行──→ IN_FENCED

IN_PARAGRAPH ──空行──→ flush + IDLE
IN_PARAGRAPH ──>> 行──→ flush段落 + IN_TRANSLATION
IN_PARAGRAPH ──普通行──→ 继续累积

IN_TRANSLATION ──>> 行──→ 继续累积
IN_TRANSLATION ──其他──→ flush译文 + 回退行 + IDLE

IN_FENCED ──::: ──→ flush围栏 + IDLE
IN_FENCED ──# 标题(首行) ──→ 记录围栏标题
IN_FENCED ──:: 元信息 ──→ 记录围栏元信息
IN_FENCED ──其他 ──→ 累积为诗词行

IN_BLOCKQUOTE ──> 行──→ 继续累积
IN_BLOCKQUOTE ──其他──→ flush引用 + 回退行 + IDLE
```

**flush 机制：** 每个累积态状态都有对应的 flush 函数，将缓冲区文本交给 `parseInline()` 解析后创建对应的 AST 节点。

#### 文件末尾处理

扫描结束后，根据当前状态 flush 可能残留的内容，确保不丢失末尾块。

### 1.3 段落分组

**文件：** [block-parser.js](src/parser/block-parser.js) → `groupParagraphs()`

`groupParagraphs()` 将相邻的 `paragraph` + `translation` 合并为 `paragraph_group`：

```
解析前：                           分组后：
┌──────────────┐                  ┌──────────────────────────┐
│ paragraph    │                  │ paragraph_group           │
│ "山不在高"    │      ──→        │   paragraph: "山不在高"   │
├──────────────┤                  │   translation: "山不在..." │
│ translation  │                  └──────────────────────────┘
│ "山不在..."   │
└──────────────┘
```

- 若 `paragraph` 后紧跟 `translation` → 合并为一个 `paragraph_group`
- 若 `paragraph` 后无 `translation` → `paragraph_group` 的 `translation` 为 `null`
- 若孤立的 `translation`（无前方 `paragraph`）→ `paragraph_group` 的 `paragraph` 为 `null`

### 1.4 AST 节点结构

**文件：** [ast.js](src/parser/ast.js)

所有 AST 节点由工厂函数创建，分为 Block 节点和 Inline 节点两大类：

#### Block 节点

| 节点类型 | 结构 | 说明 |
|---------|------|------|
| `document` | `{ type, meta, children }` | 根节点，children 为分组后的块节点列表 |
| `heading` | `{ type, level, children }` | 标题，level 1-3，children 为内联节点 |
| `paragraph` | `{ type, children }` | 段落，children 为内联节点 |
| `translation` | `{ type, children }` | 译文，children 为内联节点 |
| `paragraph_group` | `{ type, paragraph, translation }` | 段落+译文组 |
| `poetry_block` | `{ type, title, meta, lines }` | 诗词块，lines 为内联节点数组的数组 |
| `blockquote` | `{ type, children }` | 引用块 |
| `section_break` | `{ type }` | 分隔线 |
| `proofread_date` | `{ type, date }` | 校对日期 |

#### Inline 节点

| 节点类型 | 结构 | 说明 |
|---------|------|------|
| `text` | `{ type, value }` | 纯文本 |
| `ruby` | `{ type, base, annotation }` | 注音：`{字\|拼音}` |
| `annotate` | `{ type, text, note }` | 注释：`[词](释义)` |
| `ruby_annotate` | `{ type, items, note }` | 注音+注释组合，items 为 `[{ base, annotation }]` |
| `emphasis` | `{ type, children }` | 着重：`*文本*` |
| `proper_noun` | `{ type, children }` | 专名：`_文本_` |
| `book_title` | `{ type, title }` | 书名：`《书名》` |

### 1.5 内联解析

**文件：** [inline-parser.js](src/parser/inline-parser.js)

`parseInline()` 从左到右扫描文本，按**最早出现优先**原则匹配内联标记。

#### 匹配优先级

解析器定义了 6 种内联模式，按以下优先级尝试匹配：

| 优先级 | 语法 | 正则 | 产生的节点 |
|--------|------|------|-----------|
| 1 | `[{字\|拼音}{字}...](释义)` | `\[((?:\{[^}]+\})+)\]\(([^)]+)\)` | `ruby_annotate` |
| 2 | `{字\|拼音}` | `\{([^|{}]+)\|([^}]+)\}` | `ruby` |
| 3 | `[词](释义)` | `\[[^\]]+\]\([^)]+\)` | `annotate` |
| 4 | `《书名》` | `《([^》]+)》` | `book_title` |
| 5 | `*文本*` | `\*([^*]+)\*` | `emphasis` |
| 6 | `_文本_` | `_([^_]+)_` | `proper_noun` |

#### 解析算法

```
输入: "有{仙|xiān}则[斯](这)是"

步骤1: 扫描所有模式，找到最早出现的匹配
  → {仙|xiān} 在位置1，最靠前

步骤2: 匹配前的文本 "有" → text 节点

步骤3: 创建 ruby 节点 { base: "仙", annotation: "xiān" }

步骤4: 剩余文本 "则[斯](这)是"

步骤5: 再次扫描，找到 [斯](这) 在位置1

步骤6: 匹配前的文本 "则" → text 节点

步骤7: 创建 annotate 节点 { text: "斯", note: "这" }

步骤8: 剩余文本 "是" → text 节点

输出: [text("有"), ruby("仙","xiān"), text("则"), annotate("斯","这"), text("是")]
```

**递归解析：** `emphasis` 和 `proper_noun` 模式会递归调用 `parseInline()` 解析内部内容，支持嵌套。

**`ruby_annotate` 的特殊处理：** 中括号内的大括号序列通过 `parseRubyBlocks()` 函数单独解析，将 `{穹|qióng}{庐}` 拆分为 `[{ base: '穹', annotation: 'qióng' }, { base: '庐', annotation: null }]`。

---

## 阶段二：渲染（Render）

渲染阶段遍历 AST 节点树，生成 HTML body 字符串。

**文件：** [html-renderer.js](src/renderer/html-renderer.js)

### 2.1 主体渲染流程

`renderBody(doc)` 的渲染顺序：

1. **判断是否渲染文档头部**：如果文档包含带标题的诗词块（`poetry_block` 且有 `title`），则不渲染头部（诗词自带标题）；否则渲染 `<header class="wyw-header">`
2. **渲染工具栏**：固定底部的「译」和「月」按钮
3. **渲染正文**：遍历 `doc.children`，对每个块节点调用 `renderBlock()`

### 2.2 块级节点 → HTML 映射

| AST 节点类型 | 输出 HTML | 渲染函数 |
|-------------|----------|---------|
| `heading` | `<h2>...<h3>...` (level+1) | `renderHeading()` |
| `paragraph_group` | `<div class="wyw-para-group">` | `renderParagraphGroup()` |
| `paragraph` | `<p>...</p>` | 直接渲染 |
| `translation` | `<p class="wyw-translation">...</p>` | 直接渲染 |
| `poetry_block` | `<div class="wyw-poetry">` | `renderPoetryBlock()` |
| `blockquote` | `<blockquote><p>...</p></blockquote>` | 直接渲染 |
| `section_break` | `<hr class="wyw-hr">` | 直接渲染 |
| `proofread_date` | `<footer class="wyw-proofread">` | 直接渲染 |

**标题级别偏移：** `#` 对应 `<h2>`，`##` 对应 `<h3>`，`###` 对应 `<h4>`。`<h1>` 保留给文档大标题。

**段落组的渲染结构：**
```html
<div class="wyw-para-group">
  <p>文言文正文内容</p>
  <p class="wyw-translation">现代文翻译</p>
</div>
```

**诗词块的渲染结构：**
```html
<div class="wyw-poetry">
  <h1 class="wyw-poetry-title">诗词标题</h1>
  <p class="wyw-meta">[唐]李白</p>
  <p class="wyw-verse">
    床前明月光，<br>
    疑是地上霜。
  </p>
</div>
```

**文档头部的渲染结构：**
```html
<header class="wyw-header">
  <h1>陋室铭</h1>
  <p class="wyw-meta">
    <span class="wyw-dynasty">唐</span>
    <span class="wyw-author">刘禹锡</span>
  </p>
</header>
```

### 2.3 内联节点 → HTML 映射

| AST 节点类型 | 输出 HTML | 说明 |
|-------------|----------|------|
| `text` | 转义后的纯文本 | `escapeHtml()` |
| `ruby` | `<ruby>字<rp>(</rp><rt>拼音</rt><rp>)</rp></ruby>` | HTML5 ruby 注音 |
| `annotate` | `<span class="wyw-annotate" data-note="释义">词</span>` | 悬停显示注释 |
| `ruby_annotate`(单字) | `<ruby><span class="wyw-annotate" data-note="释义">字</span><rp>(</rp><rt>拼音</rt><rp>)</rp></ruby>` | 注音+注释合一 |
| `ruby_annotate`(多字) | `<ruby><span class="wyw-annotate" data-note="释义"><ruby>字1<rt>拼音1</rt></ruby>字2</span></ruby>` | 整词注释+逐字注音 |
| `emphasis` | `<em>...</em>` | 着重标记 |
| `proper_noun` | `<span class="wyw-proper">...</span>` | 专名标记 |
| `book_title` | `<cite>书名</cite>` | 书名（CSS 伪元素添加书名号） |

**`ruby_annotate` 的两种渲染路径：**

- **单字有注音**（`items.length === 1 && items[0].annotation`）：`<ruby>` 包裹 `<span class="wyw-annotate">`，span 内是 base 文本，`<rt>` 是拼音
- **多字或有字无注音**：内部逐字渲染 `<ruby>` 或纯文本，外层用 `<span class="wyw-annotate">` 包裹，最外层再套 `<ruby>`

**注释交互机制：** 注释词的释义存储在 `data-note` 属性中，通过 CSS `::before` 伪元素 + `attr(data-note)` 实现 tooltip 悬停显示，JS 端做边界检测防止溢出视口。

### 2.4 转义安全

所有文本输出都经过转义处理：

- `escapeHtml()`：将 `&`、`<`、`>` 转义为 HTML 实体，用于正文内容
- `escapeAttr()`：在 `escapeHtml` 基础上额外转义 `"` 为 `&quot;`，用于属性值

---

## 阶段三：页面组装（Page Template）

渲染阶段产出的只是 HTML body 的内容片段，页面组装阶段将其包装为完整的 HTML 页面。

**文件：** [page-template.js](src/renderer/page-template.js)、[page.hbs](src/templates/page.hbs)

### 3.1 页面模板

使用 [Handlebars](src/templates/index.js) 模板引擎，模板文件为 [page.hbs](src/templates/page.hbs)：

```html
<!DOCTYPE html>
<html lang="zh-Hans" data-theme="{{theme}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  {{{cssTag}}}
</head>
<body>
  <article class="{{articleClasses}}">
    {{{body}}}
  </article>
  {{{jsTag}}}
</body>
</html>
```

模板使用三层大括号 `{{{ }}}` 输出原始 HTML（不做转义），因为 `body`、`cssTag`、`jsTag` 都包含 HTML 标签。

### 3.2 组装参数

`renderPage()` 接收以下参数并计算模板数据：

| 参数 | 来源 | 用途 |
|------|------|------|
| `meta` | AST 的 `doc.meta` | 页面标题 `<title>`，头部渲染 |
| `body` | `renderBody()` 的输出 | 页面正文 |
| `inline` | CLI `--inline` 选项 | 是否内联 CSS/JS |
| `assetsPath` | 未使用（预留） | CSS/JS 路径前缀 |
| `theme` | CLI `--theme` 选项 | `data-theme` 属性值 |
| `showTranslation` | CLI `--show-translation` 选项 | 是否默认显示译文 |

**页面标题：** 格式为 `标题 — 作者`，无标题时默认为"文言文"。

**article 类名组合：** `wyw wyw--{layout} wyw--annotation[ wyw--hide-translation]`

- `wyw`：基础类
- `wyw--{layout}`：布局样式（默认 `ancient`）
- `wyw--annotation`：注音模式（增大行高）
- `wyw--hide-translation`：隐藏译文（通过 CSS `max-height: 0` 实现折叠）

### 3.3 CSS/JS 引入方式

`inline` 选项决定 CSS 和 JS 的引入方式：

| 模式 | CSS | JS |
|------|-----|-----|
| `inline: true` | `<style>CSS内容</style>` | `<script>JS内容</script>` |
| `inline: false` | `<link rel="stylesheet" href="wyw.css">` | `<script src="wyw.js"></script>` |

内联模式将文件内容直接读入 HTML，生成自包含的单文件；非内联模式引用外部文件，CLI 会自动复制 `wyw.css` 和 `wyw.js` 到输出目录。

---

## CSS 样式体系

**文件：** [wyw.css](src/assets/wyw.css)

### 主题系统

使用 CSS 变量实现浅色/深色主题切换：

```css
:root { --wyw-color-text: hsl(30, 10%, 12%); ... }        /* 浅色默认 */
[data-theme="dark"] { --wyw-color-text: hsl(40, 15%, 85%); ... }  /* 深色 */
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] { ... }  /* 跟随系统 */
}
```

### 排版变量

| 变量 | 值 | 用途 |
|------|----|------|
| `--wyw-font-size` | 16px | 正文字号 |
| `--wyw-font-size-large` | 20px | 诗词字号 |
| `--wyw-line-height` | 1.8 | 正文行高 |
| `--wyw-line-height-loose` | 2.4 | 注音模式行高 |
| `--wyw-indent` | 2em | 段落首行缩进 |
| `--wyw-max-width` | 42em | 内容最大宽度 |

### 字体栈

| 用途 | 字体栈 |
|------|--------|
| 正文 | Noto Serif SC, Source Han Serif SC, Songti SC, SimSun (宋体) |
| 标题/元信息 | KaiTi, STKaiti, AR PL UKai CN (楷体) |
| 译文/注释 | PingFang SC, Hiragino Sans GB, Microsoft YaHei (黑体) |
| 拼音 | Helvetica Neue, Helvetica, Arial |

### 关键样式组件

- **译文折叠**：通过 `max-height` + `opacity` 过渡动画实现，`wyw--hide-translation` 类名控制显隐
- **注释 tooltip**：`::before` 伪元素 + `attr(data-note)` + `opacity` 过渡，JS 动态设置 `data-tooltip-align` 防止溢出
- **Ruby 注音**：`ruby-align: center`，拼音字号 `0.5em`，`rp` 隐藏
- **书名号**：`cite::before/after` 伪元素添加 `《》` 字符
- **响应式**：768px / 480px 两档断点调整字号和间距
- **打印样式**：隐藏工具栏，译文全部展开，注释 tooltip 隐藏

---

## 客户端交互

**文件：** [wyw.js](src/assets/wyw.js)

编译产物中包含的客户端脚本提供以下交互功能：

### 偏好恢复（DOMContentLoaded）

从 `localStorage` 读取用户偏好并恢复：
- `wyw-show-translation`：译文显示状态
- `wyw-theme`：主题设置

### 译文切换

点击「译」按钮，切换 `wyw--hide-translation` 类名，同时更新 `aria-pressed` 属性和 localStorage。

### 主题切换

点击「月/日/自」按钮，在 `auto → light → dark` 之间循环切换 `data-theme` 属性：
- `auto`：跟随系统偏好
- `light`：强制浅色
- `dark`：强制深色

### Tooltip 边界检测

监听 `mouseenter` 和 `focusin` 事件，计算注释元素的位置和估算的 tooltip 宽度：
- 如果左侧溢出 → 设置 `data-tooltip-align="left"`
- 如果右侧溢出 → 设置 `data-tooltip-align="right"`
- 否则 → 默认居中对齐

CSS 根据 `data-tooltip-align` 值调整 `::before` 伪元素的定位。

### 键盘快捷键

- `T` 键：切换译文显示
- `D` 键：切换主题

在 `<input>`、`<textarea>`、`<select>` 等输入元素中不响应快捷键。

---

## CLI 编译流程

**文件：** [cli.js](src/cli.js)

CLI 通过 `commander` 定义 `build` 和 `init` 命令。`build` 命令的完整流程：

```
1. 读取 .wyw 文件内容
2. 调用 compile(source, options) 获取 HTML
3. 确定输出目录（-o 指定或源文件所在目录）
4. 写入 .html 文件
5. 非内联模式时，复制 wyw.css 和 wyw.js 到输出目录
6. 输出统计信息（段落数、注释数、注音数）
```

`--watch` 模式下，使用 `fs.watchFile()` 每 500ms 轮询文件变化，变化时自动重新编译。

---

## 完整编译示例

以出师表第一段为例，追踪完整编译过程：

### 输入（.wyw 源文本）

```
---
title: 出师表
author: 诸葛亮
dynasty: 三国·蜀汉
---

[先帝](指蜀汉昭烈帝刘备)创业未半而中道[崩殂](帝王之死)……

>> 先帝开创的大业未完成一半却中途去世了……
```

### 阶段一：解析 → AST

```
Document {
  meta: { title: '出师表', author: '诸葛亮', dynasty: '三国·蜀汉', ... },
  children: [
    paragraph_group {
      paragraph: Paragraph {
        children: [
          annotate { text: '先帝', note: '指蜀汉昭烈帝刘备' },
          text { value: '创业未半而中道' },
          annotate { text: '崩殂', note: '帝王之死' },
          text { value: '……' },
        ]
      },
      translation: Translation {
        children: [
          text { value: '先帝开创的大业未完成一半却中途去世了……' },
        ]
      }
    }
  ]
}
```

### 阶段二：渲染 → HTML body

```html
<header class="wyw-header">
  <h1>出师表</h1>
  <p class="wyw-meta">
    <span class="wyw-dynasty">三国·蜀汉</span>
    <span class="wyw-author">诸葛亮</span>
  </p>
</header>
<nav class="wyw-toolbar" role="toolbar">
  <button class="wyw-btn wyw-btn--translation" aria-pressed="true" title="显示/隐藏译文">译</button>
  <button class="wyw-btn wyw-btn--theme" title="切换深色模式">月</button>
</nav>
<section class="wyw-content">
<div class="wyw-para-group">
  <p><span class="wyw-annotate" data-note="指蜀汉昭烈帝刘备">先帝</span>创业未半而中道<span class="wyw-annotate" data-note="帝王之死">崩殂</span>……</p>
  <p class="wyw-translation">先帝开创的大业未完成一半却中途去世了……</p>
</div>
</section>
```

### 阶段三：页面组装 → 完整 HTML

```html
<!DOCTYPE html>
<html lang="zh-Hans" data-theme="auto">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>出师表 — 诸葛亮</title>
  <link rel="stylesheet" href="wyw.css">
</head>
<body>
  <article class="wyw wyw--ancient wyw--annotation">
    <!-- body 内容 -->
  </article>
  <script src="wyw.js"></script>
</body>
</html>
```

---

## 模块依赖关系

```
cli.js
  └─ index.js (compile)
       ├─ parser/block-parser.js (parse)
       │    ├─ parser/frontmatter.js (parseFrontmatter)
       │    ├─ parser/inline-parser.js (parseInline)
       │    └─ parser/ast.js (工厂函数)
       ├─ renderer/html-renderer.js (renderBody)
       └─ renderer/page-template.js (renderPage)
            └─ templates/index.js (loadTemplate → Handlebars)
                 └─ templates/page.hbs
```

每个模块职责单一：`frontmatter` 只管元数据提取，`inline-parser` 只管行内标记，`block-parser` 只管块级结构和组装，`html-renderer` 只管 AST → HTML 转换，`page-template` 只管页面外壳。
