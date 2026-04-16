#!/usr/bin/env node

/**
 * AI 生成文言文脚本
 * 使用大语言模型生成文言文、诗、词的全文+注释并转成 .wyw 格式
 */

import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// 类型到目录的映射
const TYPE_TO_DIR = {
  shi: 'shi',
  ci: 'ci',
  wen: 'wen',
};

// 类型到中文名称的映射
const TYPE_NAMES = {
  shi: '诗',
  ci: '词',
  wen: '文',
};

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
 * 构建 Prompt
 * @param {string} title 作品标题
 * @param {string} type 作品类型 (shi/ci/wen)
 */
function buildPrompt(title, type) {
  const typeName = TYPE_NAMES[type];
  
  const formatGuide = type === 'wen' ? `
格式要求（文言文）：
1. 文件开头使用 YAML frontmatter，包含以下字段：
   - title: 文章标题
   - author: 作者姓名
   - dynasty: 所属朝代
   - source: 出处来源
   - layout: ancient

2. 正文格式：
   - 段落之间用空行分隔
   - 每段文言文后紧跟译文，译文以 >> 开头
   - 使用 [词](释义) 格式为关键词添加注释
   - 为生僻字添加注音，格式为 {字|拼音}

示例：
---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
source: 全唐文
layout: ancient
---

山不在高，有{仙|xiān}则名。水不在深，有{龙|lóng}则{灵|líng}。[斯](这)是[陋室](简陋的屋子)，惟吾[德馨](品德高尚)。

>> 山不在于有多高，有了仙人居住就会出名。水不在于有多深，有了龙的存在就会有灵气。这是一间简陋的屋子，只因我的品德好就不感到简陋了。
` : `
格式要求（诗/词）：
1. 文件开头使用 YAML frontmatter，包含以下字段：
   - title: 作品标题（如"唐诗五言绝句"、"宋词·念奴娇"）
   - dynasty: 所属朝代
   - source: 出处来源
   - layout: ancient

2. 每首诗/词使用 ::: poetry 围栏块：
   - # 标题
   - :: 作者（用 _ 包裹作者名表示专名）
   - 正文内容
   - 译文以 >> 开头

3. 内联标记：
   - 注音：{字|拼音}，为生僻字添加
   - 注释：[词](释义)，为关键词添加
   - 专名：_人名_、_地名_ 等
   - 书名：《书名》

示例：
---
title: 唐诗五言绝句
dynasty: 唐
source: 全唐诗
layout: ancient
---

::: poetry
# 静夜思
:: _李白_

床前{明|míng}月光，
疑是地上霜。
举头望{明|míng}月，
低头思故乡。

>> 明亮的月光洒在床前的窗户纸上，好像地上泛起了一层霜。我禁不住抬起头来，看那天窗外空中的一轮明月，不由得低头沉思，想起远方的家乡。
:::
`;

  return `你是一位精通中国古典文学的专家。请生成${typeName}作品"${title}"的完整内容，并按照指定的 .wyw 格式输出。

${formatGuide}

请直接输出 .wyw 格式的完整内容，不要添加任何解释或说明。要求：
1. 内容必须准确，符合历史原文
2. 为生僻字(非常用字)添加注音
3. 为重要词语、典故添加注释
4. 译文要准确、流畅、易懂
5. 包含完整的 frontmatter 元数据

现在请生成${typeName}"${title}"的 .wyw 格式内容：`;
}

/**
 * 调用大语言模型
 * @param {string} endpoint API 端点
 * @param {string} apiKey API Key
 * @param {string} model 模型名称
 * @param {string} prompt Prompt 内容
 */
async function callLLM(endpoint, apiKey, model, prompt) {
  const url = `${endpoint}/chat/completions`;
  
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    // 关闭思考模式（对于支持此参数的模型）
    extra_body: {
      enable_thinking: false,
    },
  };
  
  console.log(`正在调用模型 ${model}...`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} ${response.statusText}\n${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('API 返回格式异常');
  }
  
  return data.choices[0].message.content;
}

/**
 * 清理 LLM 输出，提取 .wyw 内容
 * @param {string} content LLM 返回的内容
 */
function cleanContent(content) {
  // 移除可能的 markdown 代码块标记
  let cleaned = content.trim();
  
  // 移除开头的 ```wyw 或 ```
  if (cleaned.startsWith('```wyw')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  // 移除结尾的 ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return cleaned.trim();
}

/**
 * 生成文件名
 * @param {string} title 标题
 */
function generateFileName(title) {
  // 使用标题作为文件名，移除不安全字符
  const safeName = title
    .replace(/[\\/:"*?<>|]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  return `${safeName}.wyw`;
}

/**
 * 保存 .wyw 文件
 * @param {string} title 标题
 * @param {string} type 类型
 * @param {string} content 内容
 * @param {string} outputDir 输出目录
 */
async function saveWywFile(title, type, content, outputDir) {
  const subDir = TYPE_TO_DIR[type];
  const targetDir = join(outputDir, subDir);
  const fileName = generateFileName(title);
  const filePath = join(targetDir, fileName);
  
  // 确保目录存在
  await mkdir(targetDir, { recursive: true });
  
  // 写入文件
  await writeFile(filePath, content, 'utf-8');
  
  return filePath;
}

/**
 * 主入口
 */
async function main() {
  const options = parseArgs();
  
  if (!options) {
    process.exit(1);
  }
  
  let { title, type, endpoint, apikey, model, output } = options;
  
  //endpoint = "https://open.bigmodel.cn/api/paas/v4/";
  endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  model = "deepseek-v3.2"

  console.log(`\n📝 正在生成${TYPE_NAMES[type]}"${title}"...\n`);
  
  try {
    // 构建 Prompt
    const prompt = buildPrompt(title, type);
    
    // 调用 LLM
    const rawContent = await callLLM(endpoint, apikey, model, prompt);
    
    // 清理内容
    const content = cleanContent(rawContent);
    
    // 保存文件
    const filePath = await saveWywFile(title, type, content, output);
    
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
