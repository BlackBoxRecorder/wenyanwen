// HTML 渲染器
// 遍历 AST 节点树，生成 HTML 字符串

/**
 * 将 Document AST 渲染为 HTML body 内容
 * @param {Object} doc - Document AST 节点
 * @returns {string} - HTML 字符串
 */
export function renderBody(doc) {
  const parts = [];

  // 渲染文档头部
  if (doc.meta.title || doc.meta.author) {
    parts.push(renderHeader(doc.meta));
  }

  // 工具栏
  parts.push(renderToolbar());

  // 正文内容
  parts.push('<section class="wyw-content">');
  for (const block of doc.children) {
    parts.push(renderBlock(block));
  }
  parts.push('</section>');

  return parts.join('\n');
}

function renderHeader(meta) {
  const lines = ['<header class="wyw-header">'];

  if (meta.title) {
    lines.push(`  <h1>${escapeHtml(meta.title)}</h1>`);
  }

  if (meta.author || meta.dynasty) {
    lines.push('  <p class="wyw-meta">');
    if (meta.dynasty) {
      lines.push(`    <span class="wyw-dynasty">${escapeHtml(meta.dynasty)}</span>`);
    }
    if (meta.author) {
      lines.push(`    <span class="wyw-author">${escapeHtml(meta.author)}</span>`);
    }
    lines.push('  </p>');
  }

  lines.push('</header>');
  return lines.join('\n');
}

function renderToolbar() {
  return `<nav class="wyw-toolbar" role="toolbar">
  <button class="wyw-btn wyw-btn--translation" aria-pressed="true" title="显示/隐藏译文">译</button>
  <button class="wyw-btn wyw-btn--theme" title="切换深色模式">月</button>
</nav>`;
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block);
    case 'paragraph_group':
      return renderParagraphGroup(block);
    case 'paragraph':
      return `<p>${renderInlineList(block.children)}</p>`;
    case 'translation':
      return `<p class="wyw-translation">${renderInlineList(block.children)}</p>`;
    case 'poetry_block':
      return renderPoetryBlock(block);
    case 'blockquote':
      return `<blockquote><p>${renderInlineList(block.children)}</p></blockquote>`;
    case 'section_break':
      return '<hr class="wyw-hr">';
    default:
      return '';
  }
}

function renderHeading(block) {
  const tag = `h${block.level + 1}`; // h1 留给标题，正文标题从 h2 开始
  return `<${tag}>${renderInlineList(block.children)}</${tag}>`;
}

function renderParagraphGroup(block) {
  const lines = ['<div class="wyw-para-group">'];

  if (block.paragraph) {
    lines.push(`  <p>${renderInlineList(block.paragraph.children)}</p>`);
  }

  if (block.translation) {
    lines.push(`  <p class="wyw-translation">${renderInlineList(block.translation.children)}</p>`);
  }

  lines.push('</div>');
  return lines.join('\n');
}

function renderPoetryBlock(block) {
  const lines = ['<div class="wyw-poetry">'];

  if (block.title) {
    lines.push(`  <h3 class="wyw-poetry-title">${escapeHtml(block.title)}`);
    if (block.meta) {
      lines.push(`    <span class="wyw-poetry-meta">${escapeHtml(block.meta)}</span>`);
    }
    lines.push('  </h3>');
  }

  lines.push('  <p class="wyw-verse">');
  for (let i = 0; i < block.lines.length; i++) {
    const lineContent = renderInlineList(block.lines[i]);
    if (lineContent) {
      lines.push(`    ${lineContent}${i < block.lines.length - 1 ? '<br>' : ''}`);
    }
  }
  lines.push('  </p>');
  lines.push('</div>');
  return lines.join('\n');
}

// === Inline 渲染 ===

function renderInlineList(nodes) {
  if (!nodes) return '';
  return nodes.map(renderInline).join('');
}

function renderInline(node) {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);

    case 'ruby':
      return `<ruby>${escapeHtml(node.base)}<rp>(</rp><rt>${escapeHtml(node.annotation)}</rt><rp>)</rp></ruby>`;

    case 'annotate':
      return `<span class="wyw-annotate" data-note="${escapeAttr(node.note)}">${escapeHtml(node.text)}</span>`;

    case 'emphasis':
      return `<em>${renderInlineList(node.children)}</em>`;

    case 'proper_noun':
      return `<span class="wyw-proper">${renderInlineList(node.children)}</span>`;

    case 'book_title':
      return `<cite>${escapeHtml(node.title)}</cite>`;

    default:
      return '';
  }
}

// === 工具函数 ===

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
