import { pinyin } from "https://esm.sh/pinyin-pro@3.25.0";
import { parse, renderBody } from "/vendor/assets/wyw-browser.js";

// ============================================================
//  状态管理
// ============================================================
const state = {
  currentFile: null, // { category, filename, title, author, dynasty }
  content: "",
  savedContent: "",
  isDirty: false,
  isDark: false,
  fileCache: [], // 文件列表缓存
  collapsedCategories: new Set(), // 折叠状态的分类 key 集合
};

// ============================================================
//  DOM 引用 (延迟初始化)
// ============================================================
let dom = {};

function initDom() {
  dom.textarea = document.getElementById("editor");
  dom.previewEl = document.getElementById("preview");
  dom.previewPane = document.getElementById("preview-pane");
  dom.fileList = document.getElementById("file-list");
  dom.currentFilename = document.getElementById("current-filename");
  dom.statusbar = document.getElementById("statusbar");
  dom.statusFile = document.getElementById("status-file");
  dom.statusSave = document.getElementById("status-save");
  dom.statusChars = document.getElementById("status-chars");
  dom.statusLines = document.getElementById("status-lines");
  dom.toolbarStatus = document.getElementById("toolbar-status");
  // 按钮
  dom.btnSave = document.getElementById("btn-save");
  dom.btnRuby = document.getElementById("btn-ruby");
  dom.btnAnnotate = document.getElementById("btn-annotate");
  dom.btnVerify = document.getElementById("btn-verify");
  dom.btnPreview = document.getElementById("btn-preview");
  dom.btnTheme = document.getElementById("btn-theme");
  dom.btnNewFile = document.getElementById("btn-new-file");
  dom.btnAiGenerate = document.getElementById("btn-ai-generate");
  dom.btnAiSearch = document.getElementById("btn-ai-search");
  // Modal 元素
  dom.modalNewFile = document.getElementById("modal-new-file");
  dom.modalAnnotate = document.getElementById("modal-annotate");
  dom.searchPanel = document.getElementById("search-panel");
}

// ============================================================
//  Debounce 工具
// ============================================================
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ============================================================
//  API 调用封装
// ============================================================
async function apiFetch(path, options = {}) {
  const url = `/api${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ============================================================
//  UI 工具函数
// ============================================================
function setStatus(msg) {
  dom.toolbarStatus.textContent = msg;
}

function updateStatusBar() {
  const chars = dom.textarea.value.length;
  const lines = (dom.textarea.value.match(/\n/g) || []).length + 1;

  dom.statusChars.textContent = `${chars} 字符`;
  dom.statusLines.textContent = `${lines} 行`;

  if (state.currentFile) {
    dom.statusFile.textContent = `${state.currentFile.category}/${state.currentFile.filename}`;
  } else {
    dom.statusFile.textContent = "未打开文件";
  }

  if (state.isDirty) {
    dom.statusSave.textContent = "● 已修改";
    dom.statusSave.style.color = "#ffcc00";
  } else {
    dom.statusSave.textContent = "✓ 已保存";
    dom.statusSave.style.color = "";
  }
}

function showLoading(btn, text) {
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = text;
  return () => {
    btn.disabled = false;
    btn.textContent = orig;
  };
}

// ============================================================
//  预览渲染
// ============================================================
function doPreview() {
  try {
    const source = dom.textarea.value;
    const doc = parse(source);
    const html = renderBody(doc);
    dom.previewEl.innerHTML = html;
    setStatus(
      `${dom.textarea.value.length} 字符 · ${(dom.textarea.value.match(/\n/g) || []).length + 1} 行`,
    );
  } catch (e) {
    dom.previewEl.innerHTML = `<p style="color: var(--wyw-color-accent); padding: 2rem;">渲染错误：${e.message}</p>`;
    setStatus("渲染失败");
  }
}

const autoPreview = debounce(doPreview, 300);

// ============================================================
//  脏状态跟踪
// ============================================================
function markDirty() {
  if (dom.textarea.value !== state.savedContent) {
    state.isDirty = true;
  } else {
    state.isDirty = false;
  }
  updateStatusBar();
}

function markClean() {
  state.savedContent = dom.textarea.value;
  state.isDirty = false;
  updateStatusBar();
}

// ============================================================
//  文件管理
// ============================================================

// 加载文件列表
async function loadFileList() {
  try {
    const data = await apiFetch("/files");
    state.fileCache = data.files;
    renderFileTree(state.fileCache);
  } catch (e) {
    dom.fileList.innerHTML = `<div class="search-loading" style="color:#c04040;">加载失败: ${e.message}</div>`;
  }
}

// 渲染文件树
function renderFileTree(files) {
  const categories = [
    { key: "wen", name: "文", icon: "📜" },
    { key: "shi", name: "诗", icon: "🏔" },
    { key: "ci", name: "词", icon: "🌸" },
  ];

  // 保存侧边栏滚动位置
  const fileBrowser = document.getElementById("file-browser");
  const scrollTop = fileBrowser ? fileBrowser.scrollTop : 0;

  let html = "";
  for (const cat of categories) {
    const catFiles = files.filter((f) => f.category === cat.key);
    if (catFiles.length === 0) continue;

    const collapsedClass = state.collapsedCategories.has(cat.key)
      ? " collapsed"
      : "";
    html += `<div class="file-category${collapsedClass}">`;
    html += `<div class="file-category-header" data-category="${cat.key}">`;
    html += `<span class="arrow">▾</span>`;
    html += `<span>${cat.icon} ${cat.name}</span>`;
    html += `<span class="file-category-count">${catFiles.length}</span>`;
    html += `</div>`;
    html += `<div class="file-items">`;

    for (const f of catFiles) {
      const activeClass =
        state.currentFile &&
        state.currentFile.category === f.category &&
        state.currentFile.filename === f.filename
          ? " active"
          : "";
      const label = f.title ? `${f.title}` : f.filename;
      const verifyBadge = f.verified
        ? `<span class="verify-badge" title="已校验">✅</span>`
        : "";
      html += `<div class="file-item${activeClass}" data-category="${f.category}" data-filename="${encodeURIComponent(f.filename)}" title="${f.author ? f.author + " · " : ""}${f.title || f.filename}">`;
      html += `<span class="file-icon">📄</span>`;
      html += `<span class="file-item-name">${label}</span>`;
      html += verifyBadge;
      html += `</div>`;
    }

    html += `</div></div>`;
  }

  dom.fileList.innerHTML = html;

  // 恢复侧边栏滚动位置
  if (fileBrowser) {
    fileBrowser.scrollTop = scrollTop;
  }

  // 绑定分类折叠事件
  for (const header of dom.fileList.querySelectorAll(".file-category-header")) {
    header.addEventListener("click", () => {
      const catKey = header.dataset.category;
      const categoryEl = header.parentElement;
      categoryEl.classList.toggle("collapsed");
      // 同步折叠状态到 state
      if (categoryEl.classList.contains("collapsed")) {
        state.collapsedCategories.add(catKey);
      } else {
        state.collapsedCategories.delete(catKey);
      }
    });
  }

  // 绑定文件点击事件
  for (const item of dom.fileList.querySelectorAll(".file-item")) {
    item.addEventListener("click", async () => {
      const cat = item.dataset.category;
      const fname = item.dataset.filename;
      await loadFile(cat, fname);
    });
  }
}

// 加载文件内容到编辑器
async function loadFile(category, filename) {
  // 检查是否有未保存内容
  if (state.isDirty && state.currentFile) {
    if (!confirm("当前文件有未保存的修改，是否放弃修改并加载新文件？")) {
      return;
    }
  }

  try {
    setStatus("加载中...");
    const data = await apiFetch(`/files/${category}/${filename}`);
    state.currentFile = {
      category: data.category,
      filename: data.filename,
      title: data.title,
      author: data.author,
      dynasty: data.dynasty,
    };
    dom.textarea.value = data.content;
    state.savedContent = data.content;
    state.isDirty = false;

    dom.currentFilename.textContent = `${data.category}/${data.filename}`;
    doPreview();
    updateStatusBar();
    renderFileTree(state.fileCache); // 更新高亮
    setStatus(`已加载: ${data.title || data.filename}`);
  } catch (e) {
    setStatus(`加载失败: ${e.message}`);
  }
}

// 保存当前文件
async function saveCurrentFile() {
  if (!state.currentFile) {
    setStatus("未打开文件，无法保存");
    return;
  }
  if (!state.isDirty) {
    setStatus("文件未修改，无需保存");
    return;
  }

  try {
    setStatus("保存中...");
    await apiFetch(
      `/files/${state.currentFile.category}/${encodeURIComponent(state.currentFile.filename)}`,
      {
        method: "PUT",
        body: JSON.stringify({ content: dom.textarea.value }),
      },
    );
    markClean();
    setStatus("已保存");
    // 刷新文件列表以更新元数据
    await loadFileList();
  } catch (e) {
    setStatus(`保存失败: ${e.message}`);
  }
}

// 创建新文件
async function createNewFile(category, author, title) {
  try {
    const data = await apiFetch("/files", {
      method: "POST",
      body: JSON.stringify({ category, author, title }),
    });
    // 重新加载文件列表
    await loadFileList();
    // 加载新创建的文件
    await loadFile(data.category, data.filename);
    setStatus(`已创建: ${data.filename}`);
  } catch (e) {
    setStatus(`创建失败: ${e.message}`);
  }
}

// ============================================================
//  编辑器核心功能（从 vendor/wyw/editor.html 移植）
// ============================================================

// 注音（Ctrl+R）
function insertRuby() {
  const start = dom.textarea.selectionStart;
  const end = dom.textarea.selectionEnd;
  if (start === end) {
    setStatus("请先选中需要注音的汉字");
    return;
  }

  const selected = dom.textarea.value.slice(start, end);
  const chars = [...selected];
  const resultParts = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    // 跳过已有的 { } 块
    if (ch === "{") {
      let block = "";
      let depth = 0;
      while (i < chars.length) {
        if (chars[i] === "{") depth++;
        if (chars[i] === "}") depth--;
        block += chars[i++];
        if (depth === 0) break;
      }
      resultParts.push(block);
      continue;
    }

    // 为汉字添加注音
    if (/[\u4e00-\u9fff]/.test(ch)) {
      try {
        const py = pinyin(ch, { toneType: "symbol" });
        resultParts.push(`{${ch}|${py}}`);
      } catch {
        resultParts.push(ch);
      }
    } else {
      resultParts.push(ch);
    }
    i++;
  }

  const result = resultParts.join("");
  dom.textarea.setRangeText(result, start, end, "end");
  setStatus(`已注音 ${resultParts.filter((p) => p.startsWith("{")).length} 字`);
  updateAfterEdit();
}

// 注释（Ctrl+N）
function insertAnnotation(noteText) {
  const start = dom.textarea.selectionStart;
  const end = dom.textarea.selectionEnd;
  if (start === end) {
    setStatus("请先选中需要注释的文字");
    return;
  }

  const selected = dom.textarea.value.slice(start, end);

  // 将所选文字标准化：每个字符用{}包裹
  let normalized = "";
  let i = 0;
  while (i < selected.length) {
    if (selected[i] === "{") {
      let block = "";
      let depth = 0;
      while (i < selected.length) {
        if (selected[i] === "{") depth++;
        if (selected[i] === "}") depth--;
        block += selected[i++];
        if (depth === 0) break;
      }
      normalized += block;
    } else {
      normalized += `{${selected[i]}}`;
      i++;
    }
  }

  const replacement = `[${normalized}](${noteText})`;
  dom.textarea.setRangeText(replacement, start, end, "end");
  setStatus(`已添加注释：${noteText}`);
  updateAfterEdit();
}

// 校验标记（在当前文件末尾插入校验日期标记）
function insertVerify() {
  if (!state.currentFile) {
    setStatus("请先打开一个文件");
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const mark = `--${year} 年 ${month} 月 ${day} 日--`;

  // 检查是否已经包含校验标记
  if (dom.textarea.value.includes(mark)) {
    setStatus("文件已包含当前日期的校验标记");
    return;
  }

  // 在文件末尾追加校验标记
  let content = dom.textarea.value;
  // 如果末尾没有换行，先添加换行
  if (content.length > 0 && !content.endsWith("\n")) {
    content += "\n";
  }
  content += mark + "\n";
  dom.textarea.value = content;

  // 将光标移到末尾
  dom.textarea.setSelectionRange(content.length, content.length);
  dom.textarea.focus();

  updateAfterEdit();
  setStatus(`已添加校验标记：${mark}`);
}

// ============================================================
//  AI 功能
// ============================================================

async function aiGenerate() {
  // 必须有打开的文件
  if (!state.currentFile) {
    setStatus("请先打开一个 .wyw 文件，再使用「生成全文」重新生成内容");
    return;
  }

  const { title, author, category } = state.currentFile;
  const type = category; // 'wen'、'shi' 或 'ci'

  // 确认覆盖
  if (
    !confirm(
      `将使用 AI 重新生成"《${title}》"（作者：${author}），当前内容将被覆盖，是否继续？`,
    )
  ) {
    setStatus("已取消生成");
    return;
  }

  const restore = showLoading(dom.btnAiGenerate, "⏳ 生成中...");
  try {
    setStatus(`AI 正在重新生成"《${title}》"...`);
    const data = await apiFetch("/ai/generate", {
      method: "POST",
      body: JSON.stringify({ title, author, type }),
    });

    // 完全替换编辑器内容
    dom.textarea.value = data.content;
    updateAfterEdit();
    doPreview();
    updateStatusBar();
    setStatus(`已重新生成: ${title}`);
  } catch (e) {
    setStatus(`生成失败: ${e.message}`);
  } finally {
    restore();
  }
}

async function aiSearch() {
  // 优先使用当前文件的标题和作者
  let title, author;
  if (state.currentFile) {
    title = state.currentFile.title || "";
    author = state.currentFile.author || "";
  }

  if (!title) {
    title = prompt("请输入要搜索的诗文标题：");
    if (!title) return;
    author = prompt("请输入作者（可选）：") || "";
  }

  // 显示搜索结果面板
  dom.searchPanel.classList.remove("hidden");
  const searchResultsEl = document.getElementById("search-results");
  searchResultsEl.innerHTML = '<p class="search-loading">搜索中...</p>';

  try {
    const data = await apiFetch("/ai/search", {
      method: "POST",
      body: JSON.stringify({ title, author }),
    });

    let results;
    try {
      results = JSON.parse(data.results);
    } catch {
      // 不是 JSON，直接显示文本
      searchResultsEl.innerHTML = `<div class="search-result-item"><p>${data.results}</p></div>`;
      return;
    }

    if (!Array.isArray(results) || results.length === 0) {
      searchResultsEl.innerHTML =
        '<p class="search-loading">未找到相关资料</p>';
      return;
    }

    let html = "";
    for (const r of results) {
      html += `<div class="search-result-item">`;
      if (r.title) html += `<h4>${r.title}</h4>`;
      if (r.snippet) html += `<p>${r.snippet}</p>`;
      if (r.url) html += `<a href="${r.url}" target="_blank">${r.url}</a>`;
      html += `</div>`;
    }
    searchResultsEl.innerHTML = html;
  } catch (e) {
    searchResultsEl.innerHTML = `<p class="search-loading" style="color:#c04040;">搜索失败: ${e.message}</p>`;
  }
}

// ============================================================
//  主题切换
// ============================================================
function toggleTheme() {
  state.isDark = !state.isDark;
  if (state.isDark) {
    dom.previewPane.classList.add("preview-dark");
    dom.btnTheme.textContent = "☀ 浅色";
  } else {
    dom.previewPane.classList.remove("preview-dark");
    dom.btnTheme.textContent = "🌓 主题";
  }
  setStatus(state.isDark ? "已切换为暗色主题" : "已切换为浅色主题");
}

// ============================================================
//  编辑后更新
// ============================================================
function updateAfterEdit() {
  markDirty();
  autoPreview();
}

// ============================================================
//  事件绑定
// ============================================================
function bindEvents() {
  // 编辑器输入 → 自动预览 + 脏标记
  dom.textarea.addEventListener("input", updateAfterEdit);

  // 工具栏按钮
  dom.btnRuby.addEventListener("click", insertRuby);
  dom.btnAnnotate.addEventListener("click", () => openAnnotateModal());
  dom.btnVerify.addEventListener("click", insertVerify);
  dom.btnPreview.addEventListener("click", doPreview);
  dom.btnTheme.addEventListener("click", toggleTheme);
  dom.btnSave.addEventListener("click", saveCurrentFile);

  // 新建文件按钮
  dom.btnNewFile.addEventListener("click", () => {
    dom.modalNewFile.classList.remove("hidden");
    document.getElementById("new-author").focus();
  });

  // 新建文件弹窗
  document
    .getElementById("btn-confirm-new")
    .addEventListener("click", async () => {
      const category = document.getElementById("new-category").value;
      const author = document.getElementById("new-author").value.trim();
      const title = document.getElementById("new-title").value.trim();
      if (!author) {
        setStatus("请输入作者");
        return;
      }
      if (!title) {
        setStatus("请输入标题");
        return;
      }
      dom.modalNewFile.classList.add("hidden");
      await createNewFile(category, author, title);
    });
  document.getElementById("btn-cancel-new").addEventListener("click", () => {
    dom.modalNewFile.classList.add("hidden");
  });

  // 注释弹窗
  document
    .getElementById("btn-confirm-annotate")
    .addEventListener("click", () => {
      const noteText = document.getElementById("annotate-input").value.trim();
      dom.modalAnnotate.classList.add("hidden");
      if (!noteText) {
        setStatus("已取消注释");
        return;
      }
      insertAnnotation(noteText);
    });
  document
    .getElementById("btn-cancel-annotate")
    .addEventListener("click", () => {
      dom.modalAnnotate.classList.add("hidden");
      setStatus("已取消注释");
    });

  // AI 按钮
  dom.btnAiGenerate.addEventListener("click", aiGenerate);
  dom.btnAiSearch.addEventListener("click", aiSearch);

  // 搜索面板关闭
  document.getElementById("btn-close-search").addEventListener("click", () => {
    dom.searchPanel.classList.add("hidden");
  });

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    // Ctrl+S / Cmd+S = 保存
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveCurrentFile();
    }
    // Ctrl+Enter = 手动预览
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doPreview();
    }
    // Ctrl+R = 注音
    if ((e.metaKey || e.ctrlKey) && e.key === "r") {
      e.preventDefault();
      insertRuby();
    }
    // Ctrl+N = 注释
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      openAnnotateModal();
    }
  });

  // 离开页面前检查
  window.addEventListener("beforeunload", (e) => {
    if (state.isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // 新建文件弹窗回车确认
  document.getElementById("new-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("btn-confirm-new").click();
    }
  });

  // 注释弹窗回车确认
  document.getElementById("annotate-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("btn-confirm-annotate").click();
    }
  });
}

// 打开注释输入弹窗
function openAnnotateModal() {
  const start = dom.textarea.selectionStart;
  const end = dom.textarea.selectionEnd;
  if (start === end) {
    setStatus("请先选中需要注释的文字");
    return;
  }

  const selected = dom.textarea.value.slice(start, end);
  const hasRuby = /\{[^}]+\}/.test(selected);
  document.getElementById("annotate-label").textContent = hasRuby
    ? "请输入注释（释义），所选文字已包含注音标记："
    : "请输入注释（释义）：";
  document.getElementById("annotate-input").value = "";
  dom.modalAnnotate.classList.remove("hidden");
  document.getElementById("annotate-input").focus();
}

// 按 Escape 关闭弹窗
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    dom.modalNewFile.classList.add("hidden");
    dom.modalAnnotate.classList.add("hidden");
  }
});

// ============================================================
//  初始化
// ============================================================
async function init() {
  initDom();
  bindEvents();

  // 加载文件列表
  await loadFileList();

  // 设置初始状态
  updateStatusBar();
  setStatus("就绪 - 请选择文件开始编辑");
}

// 启动
init().catch((e) => {
  console.error("编辑器初始化失败:", e);
  document.body.innerHTML = `<div style="padding:40px;color:red;">编辑器初始化失败: ${e.message}</div>`;
});
