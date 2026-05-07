/**
 * fix_wyw.js
 * 遍历 wywdocs 目录中所有 .wyw 文件，执行以下处理：
 * 1. 去掉所有下划线 `_` 字符
 * 2. 清理顶部 YAML 元数据，仅保留 title / author / dynasty 三个字段
 *
 * 用法: node scripts/fix_wyw.js [--dry-run]
 */

import { readFile, writeFile, readdir } from "fs/promises";
import { join, basename, extname, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WYWDOCS_DIR = join(__dirname, "..", "wywdocs");

// ---- 已知作者 → 朝代映射表（作为缺失朝代时的补充） ----
const AUTHOR_DYNASTY_MAP = {
  // ---- 先秦 ----
  佚名: "先秦",
  屈原: "先秦",
  列子: "先秦",
  孟子: "先秦",
  庄子: "先秦",
  荀子: "先秦",
  左丘明: "先秦",
  吕不韦: "先秦",
  曹刿: "先秦",
  李斯: "先秦",
  集体: "春秋",
  // ---- 两汉 ----
  汉乐府: "汉",
  司马迁: "汉",
  刘桢: "汉末",
  曹操: "东汉",
  曹植: "曹魏",
  // ---- 魏晋南北朝 ----
  诸葛亮: "三国",
  陶弘景: "南北朝",
  郦道元: "南北朝",
  刘义庆: "南北朝",
  吴均: "南北朝",
  北朝民歌: "南北朝",
  // ---- 唐 ----
  李白: "唐",
  杜甫: "唐",
  白居易: "唐",
  王维: "唐",
  孟浩然: "唐",
  王昌龄: "唐",
  王之涣: "唐",
  杜牧: "唐",
  李商隐: "唐",
  刘禹锡: "唐",
  柳宗元: "唐",
  韩愈: "唐",
  岑参: "唐",
  崔颢: "唐",
  常建: "唐",
  张继: "唐",
  张若虚: "唐",
  温庭筠: "唐",
  李贺: "唐",
  李绅: "唐",
  李益: "唐",
  李峤: "唐",
  孟郊: "唐",
  卢纶: "唐",
  林杰: "唐",
  刘长卿: "唐",
  魏徵: "唐",
  // ---- 宋 ----
  苏轼: "宋",
  王安石: "宋",
  欧阳修: "宋",
  辛弃疾: "宋",
  李清照: "宋",
  陆游: "宋",
  范仲淹: "宋",
  晏殊: "宋",
  柳永: "宋",
  秦观: "宋",
  黄庭坚: "宋",
  朱熹: "宋",
  杨万里: "宋",
  文天祥: "宋",
  姜夔: "宋",
  张孝祥: "宋",
  张志和: "宋",
  朱敦儒: "宋",
  王观: "宋",
  陈与义: "宋",
  周敦颐: "宋",
  叶绍翁: "宋",
  林升: "宋",
  卢钺: "宋",
  曾几: "宋",
  李煜: "南唐",
  宋濂: "明",
  // ---- 元 ----
  马致远: "元",
  张养浩: "元",
  // ---- 明 ----
  唐寅: "明",
  夏完淳: "明",
  张岱: "明",
  // ---- 清 ----
  纳兰性德: "清",
  查慎行: "清",
  曹雪芹: "清",
  蒲松龄: "清",
  姚鼐: "清",
  林觉民: "清",
  秋瑾: "清",
  // ---- 近现代 ----
  毛泽东: "现代",
  梁启超: "近代",
  鲁迅: "现代",
};

// ========== 工具函数 ==========

/** 递归遍历目录，yield 每个 .wyw 文件的绝对路径 */
async function* walkDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // 目录不可读则跳过
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isSymbolicLink && entry.isSymbolicLink()) {
      // 跳过符号链接
    } else if (extname(entry.name) === ".wyw") {
      yield fullPath;
    }
  }
}

/** 去掉内容中所有下划线 */
function removeUnderscores(content) {
  return content.replace(/_/g, "");
}

/**
 * 解析 YAML 前置元数据（第一对 `---` 之间的内容）
 * 返回 { fields, bodyBefore, bodyAfter }
 */
function parseFrontMatter(content) {
  if (!content.startsWith("---")) {
    return { fields: {}, bodyBefore: "", bodyAfter: content };
  }

  // 找到闭合的 ---（从第 4 个字符开始搜索，跳过开头的 ---）
  const closingIdx = content.indexOf("\n---", 3);
  if (closingIdx === -1) {
    // 没有闭合，整个内容当作 body
    return { fields: {}, bodyBefore: "", bodyAfter: content };
  }

  const fmBlock = content.substring(4, closingIdx); // 跳过 "---\n"
  const bodyAfter = content.substring(closingIdx + 4); // 跳过 "\n---"

  const fields = {};
  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx).trim();
      const value = trimmed.substring(colonIdx + 1).trim();
      fields[key] = value;
    }
  }

  return { fields, bodyBefore: "", bodyAfter };
}

/** 从文件内容中提取作者名（如 `:: 李白` 行，排除 `:::` 块标记） */
function extractAuthorFromContent(content) {
  // 匹配以 :: 开头但非 ::: 的行，提取后面的内容作为作者
  const m = content.match(/^::(?!:)\s*(.+?)\s*$/m);
  if (!m) return null;
  // 去掉注音标记 {char|pinyin}，只保留汉字部分
  let author = m[1].trim().replace(/\{[^}]+\}/g, "");
  return author.trim() || null;
}

/** 从文件名中提取作者和标题（格式: Author_Title.wyw） */
function extractInfoFromFilename(filePath) {
  const name = basename(filePath, ".wyw");
  const idx = name.indexOf("_");
  if (idx > 0) {
    return {
      author: name.substring(0, idx),
      title: name.substring(idx + 1),
    };
  }
  return { author: null, title: name };
}

/** 根据作者查找朝代 */
function lookupDynasty(author) {
  return AUTHOR_DYNASTY_MAP[author] || null;
}

/** 构建干净的 YAML 前置元数据 */
function buildFrontMatter(fields) {
  const lines = ["---"];
  if (fields.title) lines.push(`title: ${fields.title}`);
  if (fields.author) lines.push(`author: ${fields.author}`);
  if (fields.dynasty) lines.push(`dynasty: ${fields.dynasty}`);
  lines.push("---");
  return lines.join("\n");
}

// ========== 核心处理 ==========

/**
 * 处理单个 .wyw 文件
 * @returns {{ path, relPath, title, author, dynasty, changed }}
 */
async function processFile(filePath, dryRun) {
  const relPath = relative(WYWDOCS_DIR, filePath);
  let content = await readFile(filePath, "utf-8");
  let changed = false;

  // ---- Step 1: 去掉所有下划线 ----
  const noUnderscore = removeUnderscores(content);
  if (noUnderscore !== content) {
    content = noUnderscore;
    changed = true;
  }

  // ---- Step 2: 解析并清理 YAML 元数据 ----
  const { fields, bodyAfter } = parseFrontMatter(content);

  // 尝试从内容中补充缺失的作者
  if (!fields.author || fields.author.trim() === "") {
    const bodyAuthor = extractAuthorFromContent(content);
    if (bodyAuthor) {
      fields.author = bodyAuthor;
      changed = true;
    }
  }

  // 尝试从文件名中补充缺失字段
  const fileInfo = extractInfoFromFilename(filePath);
  if ((!fields.author || fields.author.trim() === "") && fileInfo.author) {
    fields.author = fileInfo.author;
    changed = true;
  }
  if ((!fields.title || fields.title.trim() === "") && fileInfo.title) {
    fields.title = fileInfo.title;
    changed = true;
  }

  // 尝试从映射表中补充缺失的朝代
  if ((!fields.dynasty || fields.dynasty.trim() === "") && fields.author) {
    const dynasty = lookupDynasty(fields.author);
    if (dynasty) {
      fields.dynasty = dynasty;
      changed = true;
    }
  }

  // 只保留三个字段
  const cleanFields = {
    title: fields.title || "未知标题",
    author: fields.author || "未知作者",
    dynasty: fields.dynasty || "未知朝代",
  };

  // 检查原始字段是否有多余的
  const extraKeys = Object.keys(fields).filter(
    (k) => !["title", "author", "dynasty"].includes(k),
  );
  if (extraKeys.length > 0) {
    changed = true;
  }

  // ---- Step 3: 重建文件内容 ----
  const newFrontMatter = buildFrontMatter(cleanFields);
  // 去掉 bodyAfter 前导的一个换行，避免双换行
  const cleanBody = bodyAfter.replace(/^\n/, "");
  const newContent = newFrontMatter + "\n" + cleanBody;

  if (newContent !== content) {
    changed = true;
  }

  if (changed && !dryRun) {
    await writeFile(filePath, newContent, "utf-8");
  }

  return {
    path: filePath,
    relPath,
    title: cleanFields.title,
    author: cleanFields.author,
    dynasty: cleanFields.dynasty,
    changed,
  };
}

// ========== 入口 ==========

async function main() {
  const dryRun =
    process.argv.includes("--dry-run") || process.argv.includes("-n");
  if (dryRun) {
    console.log("🔍 预览模式 (--dry-run)，不会实际修改文件\n");
  }

  console.log(`📂 扫描目录: ${WYWDOCS_DIR}\n`);

  // 收集所有文件
  const files = [];
  for await (const f of walkDir(WYWDOCS_DIR)) {
    files.push(f);
  }
  files.sort();

  console.log(`找到 ${files.length} 个 .wyw 文件\n`);
  console.log("开始处理...\n");

  let processed = 0;
  let changedCount = 0;
  let errors = 0;
  const details = [];

  for (const filePath of files) {
    try {
      const result = await processFile(filePath, dryRun);
      processed++;

      const status = result.changed ? "✏️ " : "✓  ";
      const marker = result.changed ? " [已修改]" : "";

      console.log(
        `${status}[${String(processed).padStart(3, " ")}/${files.length}] ` +
          `${result.author} · ${result.title} (${result.dynasty})${marker}`,
      );

      if (result.changed) {
        changedCount++;
        details.push(result);
      }
    } catch (err) {
      errors++;
      console.error(
        `✗ 错误 [${relative(WYWDOCS_DIR, filePath)}]: ${err.message}`,
      );
    }
  }

  // 汇总
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 处理完成`);
  console.log(`   总文件数: ${files.length}`);
  console.log(`   成功处理: ${processed}`);
  console.log(`   有修改:   ${changedCount}`);
  console.log(`   错误:     ${errors}`);
  if (dryRun) {
    console.log(`   (预览模式，未实际写入)`);
  }
  console.log(`${"=".repeat(60)}`);

  // 输出修改明细
  if (details.length > 0) {
    console.log(`\n📝 修改明细:`);
    for (const d of details) {
      console.log(`   - ${d.relPath}`);
      console.log(`     → ${d.author} · ${d.title} (${d.dynasty})`);
    }
  }
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
