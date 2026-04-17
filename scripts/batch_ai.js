#!/usr/bin/env node

/**
 * 批量生成文言文脚本
 * 读取 title.csv，批量调用 ai.js 生成文言文、诗、词并保存为 .wyw 格式
 */

import { Command } from 'commander';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import {
  TYPE_TO_DIR,
  TYPE_CN_TO_EN,
  generateFileName,
  fileExists,
} from './lib/ai_util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * 解析命令行参数
 */
function parseArgs() {
  const program = new Command();
  
  program
    .name('batch-ai')
    .description('批量生成文言文、诗、词并保存为 .wyw 格式')
    .version('1.0.0');
  
  program
    .option('-o, --output <dir>', '输出目录', join(PROJECT_ROOT, 'wywdocs'))
    .option('-i, --input <file>', '输入 CSV 文件', join(__dirname, 'title.csv'));
  
  program.parse(process.argv);
  
  const options = program.opts();
  
  return options;
}

/**
 * 解析 CSV 文件
 * @param {string} filePath CSV 文件路径
 */
async function parseCSV(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  const records = [];
  
  // 跳过表头
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 解析格式：作者姓名,作品标题,类型
    const parts = line.split(',');
    if (parts.length >= 3) {
      const author = parts[0].trim();
      const title = parts[1].trim();
      const typeCN = parts[2].trim();
      const type = TYPE_CN_TO_EN[typeCN];
      
      if (type) {
        records.push({ author, title, type, typeCN });
      } else {
        console.warn(`警告: 第 ${i + 1} 行类型未知: ${typeCN}`);
      }
    }
  }
  
  return records;
}

/**
 * 调用 ai.js 生成单个作品
 * @param {string} title 作品标题
 * @param {string} author 作者姓名
 * @param {string} type 作品类型
 * @param {Object} options 配置选项
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function callAiJs(title, author, type, options) {
  const { output } = options;
  const aiJsPath = join(__dirname, 'ai.js');

  const args = [
    aiJsPath,
    'generate',
    '-t', title,
    '-a', author,
    '--type', type,
    '-o', output,
  ];

  return new Promise((resolve) => {
    const child = spawn('node', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || '未知错误' });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

/**
 * 主入口
 */
async function main() {
  const options = parseArgs();

  if (!options) {
    process.exit(1);
  }

  const { output, input } = options;

  console.log('\n========================================');
  console.log('  批量生成文言文、诗、词');
  console.log('========================================\n');

  try {
    // 解析 CSV
    console.log(`读取 CSV 文件: ${input}`);
    const records = await parseCSV(input);
    console.log(`共发现 ${records.length} 条记录\n`);

    // 统计
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const failedRecords = [];

    // 逐个处理
    for (let i = 0; i < records.length; i++) {
      const { author, title, type, typeCN } = records[i];
      const progress = `[${i + 1}/${records.length}]`;

      // 检查文件是否已存在
      const subDir = TYPE_TO_DIR[type];
      const fileName = generateFileName(title, author);
      const filePath = join(output, subDir, fileName);

      if (await fileExists(filePath)) {
        console.log(`${progress} 跳过（已存在）: ${title} - ${author}`);
        skipCount++;
        continue;
      }

      console.log(`${progress} 正在生成: ${title} - ${author} (${typeCN})`);

      // 调用 ai.js 进行生成
      const result = await callAiJs(title, author, type, {
        output,
      });

      if (result.success) {
        console.log(`      成功`);
        successCount++;
      } else {
        console.error(`      失败: ${result.error}`);
        failCount++;
        failedRecords.push({ author, title, typeCN, error: result.error });
      }
    }

    // 输出统计
    console.log('\n========================================');
    console.log('  生成完成');
    console.log('========================================');
    console.log(`  成功: ${successCount}`);
    console.log(`  跳过: ${skipCount}`);
    console.log(`  失败: ${failCount}`);
    console.log('========================================\n');

    // 输出失败列表
    if (failedRecords.length > 0) {
      console.log('失败列表:');
      failedRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.title} - ${r.author} (${r.typeCN})`);
        console.log(`     错误: ${r.error}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error(`\n错误: ${error.message}\n`);
    process.exit(1);
  }
}

main();
