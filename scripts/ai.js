#!/usr/bin/env node

/**
 * AI 生成文言文脚本
 * 使用大语言模型生成文言文、诗、词的全文+注释并转成 .wyw 格式
 */

import { Command } from 'commander';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  TYPE_TO_DIR,
  TYPE_NAMES,
  buildPrompt,
  callLLM,
  cleanContent,
  saveWywFile,
} from './lib/ai_util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * 解析命令行参数
 * @returns {Object|null} 解析后的参数，如果验证失败返回 null
 */
function parseArgs() {
  const program = new Command();
  
  program
    .name('ai')
    .description('使用 AI 生成文言文、诗、词并保存为 .wyw 格式')
    .version('1.0.0');
  
  program
    .command('generate')
    .description('生成文言文作品')
    .requiredOption('-t, --title <title>', '作品标题')
    .requiredOption('-a, --author <author>', '作者姓名')
    .requiredOption('--type <type>', '作品类型 (shi/ci/wen)')
    .option('-e, --endpoint <endpoint>', 'OpenAI 兼容接口地址', 'https://api.openai.com/v1')
    .option('-k, --apikey <apikey>', 'API Key (也可通过环境变量 OPENAI_API_KEY 设置)')
    .option('-m, --model <model>', '模型名称', 'gpt-4o')
    .option('-o, --output <dir>', '输出目录', join(PROJECT_ROOT, 'wywdocs'));
  
  program.parse(process.argv);
  
  const generateCommand = program.commands.find(cmd => cmd.name() === 'generate');
  const options = generateCommand?.opts();
  
  if (!options) {
    return null;
  }
  
  // 验证类型
  if (!['shi', 'ci', 'wen'].includes(options.type)) {
    console.error(`错误: 类型必须是 shi、ci 或 wen，当前为: ${options.type}`);
    return null;
  }
  
  // 获取 API Key
  const apiKey = options.apikey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('错误: 请通过 --apikey 参数或 OPENAI_API_KEY 环境变量提供 API Key');
    return null;
  }
  
  options.apikey = apiKey;
  
  return options;
}

/**
 * 主入口
 */
async function main() {
  const options = parseArgs();
  
  if (!options) {
    process.exit(1);
  }
  
  let { title, author, type, endpoint, apikey, model, output } = options;
  
  //endpoint = "https://open.bigmodel.cn/api/paas/v4/";
  endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  model = "deepseek-v3.2"
  //model = "qwen3.5-flash"
  //model = "qwen3.6-plus"
  //model = "qwen3.5-flash"
  
  
  console.log(`\n📝 正在生成${TYPE_NAMES[type]}"《${title}》"（作者：${author}）...\n`);
    
  try {
    // 构建 Prompt
    const prompt = buildPrompt(title, author, type);
      
    // 调用 LLM
    const rawContent = await callLLM(endpoint, apikey, model, prompt);
      
    // 清理内容
    const content = cleanContent(rawContent);
      
    // 保存文件
    const filePath = await saveWywFile(title, author, type, content, output);
    
    console.log(`\n✅ 生成成功！`);
    console.log(`📄 文件保存至: ${filePath}\n`);
    
    // 显示内容预览
    const previewLines = content.split('\n').slice(0, 10);
    console.log('📖 内容预览:');
    console.log('---');
    previewLines.forEach(line => console.log(line));
    if (content.split('\n').length > 10) {
      console.log('...');
    }
    console.log('---\n');
    
  } catch (error) {
    console.error(`\n❌ 生成失败: ${error.message}\n`);
    process.exit(1);
  }
}

main();
