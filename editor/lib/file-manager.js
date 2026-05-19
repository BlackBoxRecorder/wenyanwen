import { readdir, readFile as fsReadFile, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const WYWDOCS_PATH = join(PROJECT_ROOT, "wywdocs");

const VALID_CATEGORIES = ["wen", "shi", "ci"];
const CATEGORY_NAMES = { wen: "文", shi: "诗", ci: "词" };

/**
 * 安全校验 category 参数，防止路径穿越
 */
function validateCategory(category) {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`无效的分类: ${category}，仅支持 wen/shi/ci`);
  }
  return category;
}

/**
 * 安全校验 filename，防止路径穿越
 */
function validateFilename(filename) {
  const decoded = decodeURIComponent(filename);
  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
    throw new Error("无效的文件名");
  }
  if (!decoded.endsWith(".wyw")) {
    throw new Error("文件名必须以 .wyw 结尾");
  }
  return decoded;
}

/**
 * 提取文件的 YAML frontmatter 元数据
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { title: "", author: "", dynasty: "" };
  }
  const parsed = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      parsed[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return {
    title: parsed.title || "",
    author: parsed.author || "",
    dynasty: parsed.dynasty || "",
  };
}

/**
 * 列出 .wyw 文件
 * @param {string|null} category - 可选筛选分类
 * @returns {Promise<Array>}
 */
export async function listFiles(category = null) {
  const categories = category ? [validateCategory(category)] : VALID_CATEGORIES;
  const result = [];

  for (const cat of categories) {
    const dirPath = join(WYWDOCS_PATH, cat);
    if (!existsSync(dirPath)) continue;

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".wyw")) continue;

      try {
        const content = await fsReadFile(join(dirPath, entry.name), "utf-8");
        const meta = extractFrontmatter(content);
        result.push({
          category: cat,
          categoryName: CATEGORY_NAMES[cat],
          filename: entry.name,
          title: meta.title,
          author: meta.author,
          dynasty: meta.dynasty,
          size: Buffer.byteLength(content, "utf-8"),
        });
      } catch {
        // 跳过无法读取的文件
        result.push({
          category: cat,
          categoryName: CATEGORY_NAMES[cat],
          filename: entry.name,
          title: "",
          author: "",
          dynasty: "",
          size: 0,
        });
      }
    }
  }

  return result;
}

/**
 * 读取单个 .wyw 文件
 * @param {string} category
 * @param {string} filename
 * @returns {Promise<Object>}
 */
export async function readFile(category, filename) {
  validateCategory(category);
  const safeName = validateFilename(filename);
  const filePath = join(WYWDOCS_PATH, category, safeName);

  if (!existsSync(filePath)) {
    const err = new Error(`文件不存在: ${safeName}`);
    err.code = "ENOENT";
    throw err;
  }

  const content = await fsReadFile(filePath, "utf-8");
  const meta = extractFrontmatter(content);

  return {
    category,
    filename: safeName,
    content,
    title: meta.title,
    author: meta.author,
    dynasty: meta.dynasty,
  };
}

/**
 * 创建新的 .wyw 文件
 * @param {string} category
 * @param {string} author
 * @param {string} title
 * @param {string} content
 * @returns {Promise<Object>}
 */
export async function createFile(category, author, title, content) {
  validateCategory(category);
  const dirPath = join(WYWDOCS_PATH, category);

  // 生成文件名
  const safeAuthor = author.replace(/[\\/:"*?<>|]/g, "").replace(/\s+/g, "-").substring(0, 20);
  const safeTitle = title.replace(/[\\/:"*?<>|]/g, "").replace(/\s+/g, "-").substring(0, 30);
  const filename = `${safeAuthor}_${safeTitle}.wyw`;

  // 如果未提供 content，使用默认模板
  const defaultContent = content || `---
title: ${title}
author: ${author}
dynasty:
---

`;

  const filePath = join(dirPath, filename);
  await writeFile(filePath, defaultContent, "utf-8");

  const meta = extractFrontmatter(defaultContent);
  return {
    success: true,
    filepath: `${category}/${filename}`,
    category,
    filename,
    title: meta.title,
    author: meta.author,
    dynasty: meta.dynasty,
  };
}

/**
 * 更新 .wyw 文件内容
 * @param {string} category
 * @param {string} filename
 * @param {string} content
 */
export async function updateFile(category, filename, content) {
  validateCategory(category);
  const safeName = validateFilename(filename);
  const filePath = join(WYWDOCS_PATH, category, safeName);

  if (!existsSync(filePath)) {
    const err = new Error(`文件不存在: ${safeName}`);
    err.code = "ENOENT";
    throw err;
  }

  // 内容大小限制：100KB
  if (Buffer.byteLength(content, "utf-8") > 100 * 1024) {
    throw new Error("文件内容超过 100KB 限制");
  }

  await writeFile(filePath, content, "utf-8");
}

/**
 * 删除 .wyw 文件
 * @param {string} category
 * @param {string} filename
 */
export async function deleteFile(category, filename) {
  validateCategory(category);
  const safeName = validateFilename(filename);
  const filePath = join(WYWDOCS_PATH, category, safeName);

  if (!existsSync(filePath)) {
    const err = new Error(`文件不存在: ${safeName}`);
    err.code = "ENOENT";
    throw err;
  }

  await unlink(filePath);
}
