#!/usr/bin/env node

/**
 * validate_wyw.js
 * 遍历 wywdocs 目录中子目录中所有 .wyw 文件，
 * 使用 npx @timetickme/wyw validate 命令进行校验，
 * 将校验不通过的结果保存为 JSON 文件。
 *
 * 用法: node scripts/validate_wyw.js [--output <file>]
 */

import { Command } from "commander";
import { dirname, join, relative, extname } from "path";
import { fileURLToPath } from "url";
import { readdir, writeFile } from "fs/promises";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const WYWDOCS_DIR = join(PROJECT_ROOT, "wywdocs");

// 并发控制限制
const CONCURRENCY_LIMIT = 10;

/**
 * 递归遍历目录，yield 每个 .wyw 文件的绝对路径
 */
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
    } else if (extname(entry.name) === ".wyw") {
      yield fullPath;
    }
  }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const program = new Command();

  program
    .name("validate-wyw")
    .description("批量校验 wywdocs 目录中所有 .wyw 文件")
    .version("1.0.0");

  program.option(
    "-o, --output <file>",
    "校验结果输出文件",
    join(__dirname, "validate_result.json"),
  );

  program.parse(process.argv);

  return program.opts();
}

/**
 * 对单个 .wyw 文件执行校验
 * @param {string} filePath 文件绝对路径
 * @returns {Promise<{success: boolean, exitCode: number, error: string}>}
 */
function validateFile(filePath) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["@timetickme/wyw", "validate", filePath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: PROJECT_ROOT,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        error: (stderr || stdout || "").trim(),
      });
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        exitCode: -1,
        error: err.message,
      });
    });
  });
}

/**
 * 并发校验调度器
 * @param {string[]} files 文件路径列表
 */
async function runValidation(files) {
  const total = files.length;
  const stats = {
    passed: 0,
    failed: 0,
    failures: [],
  };

  let currentIndex = 0;
  const runningTasks = new Map();

  const getNextTask = () => {
    if (currentIndex >= total) return null;
    const filePath = files[currentIndex];
    const index = currentIndex;
    currentIndex++;
    return { filePath, index };
  };

  const processOne = async (filePath, index) => {
    const relPath = relative(WYWDOCS_DIR, filePath);
    const result = await validateFile(filePath);

    const progress = `[${index + 1}/${total}]`;
    if (result.success) {
      stats.passed++;
      console.log(`${progress} PASS  ${relPath}`);
    } else {
      stats.failed++;
      stats.failures.push({
        file: relPath,
        exitCode: result.exitCode,
        error: result.error,
      });
      console.log(`${progress} FAIL  ${relPath}`);
      if (result.error) {
        console.log(`       → ${result.error}`);
      }
    }
  };

  const startTask = async () => {
    const task = getNextTask();
    if (!task) return;

    const { filePath, index } = task;
    const taskPromise = processOne(filePath, index).finally(() => {
      runningTasks.delete(index);
    });

    runningTasks.set(index, taskPromise);
  };

  // 主循环：保持最多 CONCURRENCY_LIMIT 个并发任务
  while (currentIndex < total || runningTasks.size > 0) {
    while (runningTasks.size < CONCURRENCY_LIMIT && currentIndex < total) {
      startTask();
    }

    if (runningTasks.size > 0) {
      await Promise.race(runningTasks.values());
    }
  }

  return stats;
}

/**
 * 主入口
 */
async function main() {
  const options = parseArgs();
  const { output } = options;

  console.log("\n========================================");
  console.log("  批量校验 .wyw 文件");
  console.log("========================================\n");

  // 收集所有 .wyw 文件
  console.log("正在扫描 .wyw 文件...");
  const files = [];
  for await (const f of walkDir(WYWDOCS_DIR)) {
    files.push(f);
  }
  files.sort();

  if (files.length === 0) {
    console.log("未找到任何 .wyw 文件。");
    process.exit(0);
  }

  console.log(`找到 ${files.length} 个 .wyw 文件\n`);

  // 执行校验
  const startTime = Date.now();
  const stats = await runValidation(files);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 保存结果
  const resultData = {
    timestamp: new Date().toISOString(),
    total: files.length,
    passed: stats.passed,
    failed: stats.failed,
    failures: stats.failures,
  };

  await writeFile(output, JSON.stringify(resultData, null, 2), "utf-8");

  // 输出统计
  console.log(`\n${"=".repeat(60)}`);
  console.log("  校验完成");
  console.log(`${"=".repeat(60)}`);
  console.log(`  总文件数: ${stats.passed + stats.failed}`);
  console.log(`  通过:     ${stats.passed}`);
  console.log(`  失败:     ${stats.failed}`);
  console.log(`  耗时:     ${elapsed}s`);
  console.log(`  结果已保存至: ${output}`);
  console.log(`${"=".repeat(60)}\n`);

  // 失败列表
  if (stats.failures.length > 0) {
    console.log("失败详情:");
    stats.failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.file}`);
      if (f.error) {
        console.log(`     ${f.error.replace(/\n/g, "\n     ")}`);
      }
    });
    console.log("");
  }

  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
