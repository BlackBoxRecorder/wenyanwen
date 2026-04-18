import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/parser/frontmatter.js';
import { parseInline } from '../src/parser/inline-parser.js';
import { parse } from '../src/parser/block-parser.js';
import { compile } from '../src/index.js';

// === Frontmatter 测试 ===
describe('parseFrontmatter', () => {
  it('解析标准 frontmatter', () => {
    const source = `---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
---

正文内容`;

    const { meta, body } = parseFrontmatter(source);
    assert.equal(meta.title, '陋室铭');
    assert.equal(meta.author, '刘禹锡');
    assert.equal(meta.dynasty, '唐');
    assert.equal(body, '正文内容');
  });

  it('无 frontmatter 时返回默认值', () => {
    const source = '纯正文内容';
    const { meta, body } = parseFrontmatter(source);
    assert.equal(meta.title, '');
    assert.equal(body, '纯正文内容');
  });

  it('未闭合的 frontmatter 返回原文', () => {
    const source = `---
title: 测试
正文内容`;
    const { meta, body } = parseFrontmatter(source);
    assert.equal(meta.title, '');
    assert.equal(body, source);
  });
});

// === Inline 解析测试 ===
describe('parseInline', () => {
  it('解析注音 {字|pīn}', () => {
    const nodes = parseInline('有{仙|xiān}则名');
    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].type, 'text');
    assert.equal(nodes[0].value, '有');
    assert.equal(nodes[1].type, 'ruby');
    assert.equal(nodes[1].base, '仙');
    assert.equal(nodes[1].annotation, 'xiān');
    assert.equal(nodes[2].type, 'text');
    assert.equal(nodes[2].value, '则名');
  });

  it('解析注释 [词](释义)', () => {
    const nodes = parseInline('[斯](这)是陋室');
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].type, 'annotate');
    assert.equal(nodes[0].text, '斯');
    assert.equal(nodes[0].note, '这');
    assert.equal(nodes[1].type, 'text');
    assert.equal(nodes[1].value, '是陋室');
  });

  it('解析着重 *文本*', () => {
    const nodes = parseInline('*危急存亡*之秋');
    assert.equal(nodes[0].type, 'emphasis');
    assert.equal(nodes[0].children[0].value, '危急存亡');
    assert.equal(nodes[1].type, 'text');
  });


  it('解析注音+注释组合（单字） [{字|拼音}](释义)', () => {
    const nodes = parseInline('春眠不觉[{晓|xiǎo}](天刚亮的时候)');
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].type, 'text');
    assert.equal(nodes[0].value, '春眠不觉');
    assert.equal(nodes[1].type, 'ruby_annotate');
    assert.equal(nodes[1].items.length, 1);
    assert.equal(nodes[1].items[0].base, '晓');
    assert.equal(nodes[1].items[0].annotation, 'xiǎo');
    assert.equal(nodes[1].note, '天刚亮的时候');
  });

  it('解析注音+注释组合（多字） [{字|拼音}{字}...](释义)', () => {
    const nodes = parseInline('[{穹|qióng}{庐}](游牧民族居住的圆顶毡帐)');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'ruby_annotate');
    assert.equal(nodes[0].items.length, 2);
    assert.equal(nodes[0].items[0].base, '穹');
    assert.equal(nodes[0].items[0].annotation, 'qióng');
    assert.equal(nodes[0].items[1].base, '庐');
    assert.equal(nodes[0].items[1].annotation, null);
    assert.equal(nodes[0].note, '游牧民族居住的圆顶毡帐');
  });

  it('解析注音+注释组合（复杂多字）', () => {
    const nodes = parseInline('[{邺|ye}{城}{戍|shù}](邺城服役)');
    assert.equal(nodes.length, 1);
    const ra = nodes[0];
    assert.equal(ra.type, 'ruby_annotate');
    assert.equal(ra.items.length, 3);
    assert.equal(ra.items[0].base, '邺');
    assert.equal(ra.items[0].annotation, 'ye');
    assert.equal(ra.items[1].base, '城');
    assert.equal(ra.items[1].annotation, null);
    assert.equal(ra.items[2].base, '戍');
    assert.equal(ra.items[2].annotation, 'shù');
    assert.equal(ra.note, '邺城服役');
  });

  it('注音+注释组合与其他内联语法混合', () => {
    const nodes = parseInline('{仙|xiān}[{晓|xiǎo}](天刚亮)*着重*');
    assert.equal(nodes[0].type, 'ruby');
    assert.equal(nodes[1].type, 'ruby_annotate');
    assert.equal(nodes[2].type, 'emphasis');
  });

  it('相邻注音+注释组合与普通注释', () => {
    const nodes = parseInline('[{字|pīn}](注一)[词](注二)');
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].type, 'ruby_annotate');
    assert.equal(nodes[1].type, 'annotate');
  });

  it('普通注释不受注音+注释组合影响', () => {
    const nodes = parseInline('[陋室](简陋的屋子)');
    assert.equal(nodes[0].type, 'annotate');
    assert.equal(nodes[0].text, '陋室');
  });

  it('混合解析多种内联语法', () => {
    const nodes = parseInline('{仙|xiān}[斯](这)*着重*');
    assert.equal(nodes[0].type, 'ruby');
    assert.equal(nodes[1].type, 'annotate');
    assert.equal(nodes[2].type, 'emphasis');
  });

  it('无标记的纯文本', () => {
    const nodes = parseInline('山不在高');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'text');
    assert.equal(nodes[0].value, '山不在高');
  });

  it('空文本', () => {
    const nodes = parseInline('');
    assert.equal(nodes.length, 0);
  });
});

// === Block 解析测试 ===
describe('parse (block-parser)', () => {
  it('解析带 frontmatter 的完整文档', () => {
    const source = `---
title: 测试
author: 作者
---

第一段正文

>> 翻译内容`;

    const doc = parse(source);
    assert.equal(doc.type, 'document');
    assert.equal(doc.meta.title, '测试');
    assert.equal(doc.children.length, 1);
    assert.equal(doc.children[0].type, 'paragraph_group');
    assert.ok(doc.children[0].paragraph);
    assert.ok(doc.children[0].translation);
  });

  it('段落与译文正确配对', () => {
    const source = `第一段

>> 第一段翻译

第二段

>> 第二段翻译`;

    const doc = parse(source);
    assert.equal(doc.children.length, 2);
    assert.equal(doc.children[0].type, 'paragraph_group');
    assert.ok(doc.children[0].translation);
    assert.equal(doc.children[1].type, 'paragraph_group');
    assert.ok(doc.children[1].translation);
  });

  it('无译文的段落', () => {
    const source = '独立的段落';
    const doc = parse(source);
    assert.equal(doc.children.length, 1);
    assert.equal(doc.children[0].type, 'paragraph_group');
    assert.equal(doc.children[0].translation, null);
  });

  it('解析标题', () => {
    const source = '# 标题一\n\n## 标题二';
    const doc = parse(source);
    assert.equal(doc.children[0].type, 'heading');
    assert.equal(doc.children[0].level, 1);
    assert.equal(doc.children[1].type, 'heading');
    assert.equal(doc.children[1].level, 2);
  });

  it('解析分隔线', () => {
    const source = '段落一\n\n---\n\n段落二';
    const doc = parse(source);
    assert.equal(doc.children.length, 3);
    assert.equal(doc.children[1].type, 'section_break');
  });

  it('解析引用块', () => {
    const source = '> 引用内容';
    const doc = parse(source);
    assert.equal(doc.children[0].type, 'blockquote');
  });

  it('解析诗歌围栏块', () => {
    const source = `::: poetry
# 赠汪伦
:: [唐]李白

李白乘舟将欲行，
忽闻岸上踏歌声。
:::`;

    const doc = parse(source);
    assert.equal(doc.children[0].type, 'poetry_block');
    // title 是 parseInline 返回的内联节点数组
    assert.deepEqual(doc.children[0].title, [{ type: 'text', value: '赠汪伦' }]);
    assert.equal(doc.children[0].meta, '[唐]李白');
    assert.ok(doc.children[0].lines.length > 0);
  });
});

// === 完整编译测试 ===
describe('compile', () => {
  it('编译简单文档', () => {
    const source = `---
title: 测试
author: 作者
---

有{仙|xiān}则名，[斯](这)是陋室。

>> 有仙人则出名，这是简陋的房屋。`;

    const html = compile(source, { inline: true });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<ruby>仙'));
    assert.ok(html.includes('data-note="这"'));
    assert.ok(html.includes('wyw-translation'));
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('<script>'));
  });

  it('非内联模式引用外部文件', () => {
    const html = compile('正文', { inline: false });
    assert.ok(html.includes('href="wyw.css"'));
    assert.ok(html.includes('src="wyw.js"'));
  });
});
