import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = resolve(__dirname, "demo/刘禹锡_陋室铭.wyw");
const DEMO_DIR = resolve(__dirname, "demo");
const MAITANWENG_FILE = resolve(__dirname, "demo/白居易_卖炭翁.wyw");
const SHENSHENGMAN_FILE = resolve(__dirname, "demo/李清照_声声慢·寻寻觅觅.wyw");

describe("compile 刘禹锡_陋室铭.wyw", () => {
  let source;
  let html;

  before(() => {
    source = readFileSync(DEMO_FILE, "utf-8");
    html = compile(source, { inline: true });
  });

  // 1. 编译为完整 HTML
  it("生成完整 HTML 页面", () => {
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<html"));
    assert.ok(html.includes("</html>"));
  });

  // 2. 验证元数据
  it("标题出现在 <title> 和 <h1> 中", () => {
    assert.ok(html.includes("<title>陋室铭"));
    assert.ok(html.includes("<h1>陋室铭</h1>"));
  });

  it("作者和朝代正确渲染", () => {
    assert.ok(html.includes('wyw-author">刘禹锡'));
    assert.ok(html.includes('wyw-dynasty">唐'));
  });

  // 3. 验证注音（ruby）
  it("渲染注音 {斯|sī}", () => {
    assert.ok(html.includes("<ruby>斯<rp>(</rp><rt>sī</rt><rp>)</rp></ruby>"));
  });

  it("渲染注音 {陋|lòu}", () => {
    assert.ok(html.includes("<ruby>陋<rp>(</rp><rt>lòu</rt><rp>)</rp></ruby>"));
  });

  // 4. 验证注释（annotate）
  it("渲染注释 [鸿儒](博学的人)", () => {
    assert.ok(html.includes('data-note="博学的人"'));
    assert.ok(html.includes("wyw-annotate"));
    assert.ok(html.includes(">鸿儒<"));
  });

  it("渲染注释 [白丁](没有功名、学问的平民)", () => {
    assert.ok(html.includes('data-note="没有功名、学问的平民"'));
    assert.ok(html.includes(">白丁<"));
  });

  // 5. 验证注音+注释组合
  it("渲染注音+注释组合 [{斯|sī}{是}{陋|lòu}{室}](这是简陋的屋子)", () => {
    assert.ok(html.includes('data-note="这是简陋的屋子"'));
    assert.ok(html.includes("wyw-annotate"));
  });

  // 6. 验证译文
  it("渲染译文段落", () => {
    assert.ok(html.includes("wyw-translation"));
    assert.ok(html.includes("山不在于有多高"));
    assert.ok(html.includes("苔藓的痕迹"));
  });

  // 7. 验证内联 CSS/JS
  it("inline 模式包含 <style> 和 <script>", () => {
    assert.ok(html.includes("<style>"));
    assert.ok(html.includes("</style>"));
    assert.ok(html.includes("<script>"));
    assert.ok(html.includes("</script>"));
  });

  // 8. 生成 HTML 文件保存到 demo 目录
  it("生成 HTML 文件保存到 demo 目录", () => {
    const htmlName = basename(DEMO_FILE, ".wyw") + ".html";
    const htmlPath = resolve(DEMO_DIR, htmlName);
    writeFileSync(htmlPath, html, "utf-8");

    // 验证文件已写入且内容正确
    const saved = readFileSync(htmlPath, "utf-8");
    assert.equal(saved, html);
    assert.ok(saved.includes("<!DOCTYPE html>"));
  });
});

describe("compile 白居易_卖炭翁.wyw", () => {
  let source;
  let html;

  before(() => {
    source = readFileSync(MAITANWENG_FILE, "utf-8");
    html = compile(source, { inline: true });
  });

  // 编译为完整 HTML
  it("生成完整 HTML 页面", () => {
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<html"));
    assert.ok(html.includes("</html>"));
  });

  // 验证元数据
  it("标题出现在 <title> 和 poetry-title 中", () => {
    assert.ok(html.includes("<title>卖炭翁"));
    assert.ok(html.includes('wyw-poetry-title">卖炭翁'));
  });

  it("作者出现在 poetry meta 中", () => {
    assert.ok(html.includes('wyw-meta">白居易'));
  });

  // 验证注音（ruby）
  it("渲染注音 {鬓|bìn}", () => {
    assert.ok(html.includes("<ruby>鬓<rp>(</rp><rt>bìn</rt><rp>)</rp></ruby>"));
  });

  it("渲染注音 {骑|jì}", () => {
    assert.ok(html.includes("<ruby>骑<rp>(</rp><rt>jì</rt><rp>)</rp></ruby>"));
  });

  // 验证校对日期
  it("渲染校对日期", () => {
    assert.ok(html.includes("wyw-proofread"));
    assert.ok(html.includes("2026 年 4 月 17 日"));
  });

  // 7. 验证内联 CSS/JS
  it("inline 模式包含 <style> 和 <script>", () => {
    assert.ok(html.includes("<style>"));
    assert.ok(html.includes("</style>"));
    assert.ok(html.includes("<script>"));
    assert.ok(html.includes("</script>"));
  });

  // 8. 生成 HTML 文件保存到 demo 目录
  it("生成 HTML 文件保存到 demo 目录", () => {
    const htmlName = basename(MAITANWENG_FILE, ".wyw") + ".html";
    const htmlPath = resolve(DEMO_DIR, htmlName);
    writeFileSync(htmlPath, html, "utf-8");

    const saved = readFileSync(htmlPath, "utf-8");
    assert.equal(saved, html);
    assert.ok(saved.includes("<!DOCTYPE html>"));
  });
});

describe("compile 李清照_声声慢·寻寻觅觅.wyw", () => {
  let source;
  let html;

  before(() => {
    source = readFileSync(SHENSHENGMAN_FILE, "utf-8");
    html = compile(source, { inline: true });
  });

  // 编译为完整 HTML
  it("生成完整 HTML 页面", () => {
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<html"));
    assert.ok(html.includes("</html>"));
  });

  // 验证元数据
  it("标题出现在 <title> 和 poetry-title 中", () => {
    assert.ok(html.includes("<title>声声慢"));
    assert.ok(html.includes('wyw-poetry-title">声声慢'));
  });

  it("作者出现在 poetry meta 中", () => {
    assert.ok(html.includes('wyw-meta">李清照'));
  });

  // 验证诗词正文
  it("渲染诗词正文内容", () => {
    assert.ok(html.includes("wyw-verse"));
    assert.ok(html.includes("寻寻觅觅"));
    assert.ok(html.includes("凄凄惨惨戚戚"));
    assert.ok(html.includes("怎一个、愁字了得"));
  });

  // 验证内联 CSS/JS
  it("inline 模式包含 <style> 和 <script>", () => {
    assert.ok(html.includes("<style>"));
    assert.ok(html.includes("</style>"));
    assert.ok(html.includes("<script>"));
    assert.ok(html.includes("</script>"));
  });

  // 生成 HTML 文件保存到 demo 目录
  it("生成 HTML 文件保存到 demo 目录", () => {
    const htmlName = basename(SHENSHENGMAN_FILE, ".wyw") + ".html";
    const htmlPath = resolve(DEMO_DIR, htmlName);
    writeFileSync(htmlPath, html, "utf-8");

    const saved = readFileSync(htmlPath, "utf-8");
    assert.equal(saved, html);
    assert.ok(saved.includes("<!DOCTYPE html>"));
  });
});
