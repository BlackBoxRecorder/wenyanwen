import { buildPrompt, cleanContent } from "../../scripts/lib/ai_util.js";
import { TYPE_NAMES } from "../../scripts/lib/ai_util.js";

const DEEPSEEK_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4";
const GLM_MODEL = "glm-4.7-flash";

/**
 * 调用 DeepSeek API（通过阿里云 DashScope）
 * @param {string|null} title - 作品标题
 * @param {string|null} author - 作者
 * @param {string|null} type - 作品类型 (shi/ci/wen)
 * @param {string} action - 操作类型 (generate/improve/annotate)
 * @param {string|null} content - 已有内容（improve/annotate 操作时使用）
 * @param {string|null} context - 上下文（annotate 操作时使用）
 * @returns {Promise<string>}
 */
export async function callDeepSeek(
  title,
  author,
  type,
  action,
  content,
  context,
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("未设置 DEEPSEEK_API_KEY 环境变量");
  }

  let prompt;

  switch (action) {
    case "generate":
      prompt = buildPrompt(title, author, type);
      break;

    case "improve":
      prompt = buildImprovePrompt(content);
      break;

    case "annotate":
      prompt = buildAnnotatePrompt(content, context);
      break;

    default:
      throw new Error(`未知操作: ${action}`);
  }

  const url = `${DEEPSEEK_ENDPOINT}/chat/completions`;
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    extra_body: { enable_thinking: true },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 调用失败: ${response.status}\n${errorText}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error("DeepSeek API 返回格式异常");
  }

  return cleanContent(data.choices[0].message.content);
}

/**
 * 构建"改进当前内容"的 prompt
 */
function buildImprovePrompt(content) {
  return `你是一位精通中国古典文学的专家。请优化以下文言文 .wyw 标记内容：

任务要求：
1. 修复所有不合规范的 .wyw 格式错误
2. 为缺失注音的常用生僻字添加 {字|拼音} 注音标记
3. 为缺失注释的重要词语、典故添加 [词](释义) 标记
4. 确保 frontmatter 元数据（title、author、dynasty）完整准确
5. 保持原文内容不变，仅改进标记质量

⚠️ 严禁的格式错误（必须检查并修复）：
- 裸圆括号 词(释义) 不是注释！注释必须使用 [词](释义) 格式
- [{字|拼音}词](释义) 错误！[]内每个字都必须用{}包裹，未注音的字也要写{字}

请直接输出改进后的完整 .wyw 内容，不要添加任何解释：

${content}`;
}

/**
 * 构建"智能标注选中文本"的 prompt
 */
function buildAnnotatePrompt(text, context) {
  const contextPart = context ? `\n\n这段文本的上下文为：\n${context}` : "";

  return `你是一位精通中国古典文学的专家。请为以下文言文段落添加 .wyw 格式的注音和注释标记：

原文：
${text}${contextPart}

任务要求：
1. 为生僻字添加 {字|拼音} 注音标记，拼音用小写字母+Unicode声调符号
2. 为重要词语、典故、人名、地名添加 [词](释义) 注释标记
3. 同时需要注音和注释的字，使用 [{字|拼音}](释义) 格式
4. 多个字共享一个注释时，使用 [{字|拼音}{字}...](释义) 格式，确保[]内每个字都用{}包裹
5. 不改变原文内容和顺序
6. 常见字不需要注音

⚠️ 严禁使用裸圆括号作为注释！注释必须使用 [词](释义) 格式。
⚠️ [{字|拼音}词](释义) 错误！每个字必须独立用{}包裹，未注音的字写{字}。

请只输出添加标记后的文本，不要输出原始文本或其他任何解释。`;
}

/**
 * 调用 GLM 联网搜索 API（智谱 AI）
 * @param {string} title - 作品标题
 * @param {string} author - 作者
 * @returns {Promise<string>}
 */
export async function callGLMSearch(title, author) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error("未设置 GLM_API_KEY 环境变量");
  }

  const url = `${GLM_ENDPOINT}/chat/completions`;

  const query = author
    ? `请搜索关于《${title}》（作者：${author}）的创作背景、原文内容、历代评注和翻译资料`
    : `请搜索关于《${title}》的创作背景、原文内容、历代评注和翻译资料`;

  const body = {
    model: GLM_MODEL,
    messages: [{ role: "user", content: query }],
    tools: [{ type: "web_search", web_search: { enable: true } }],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GLM API 调用失败: ${response.status}\n${errorText}`);
  }

  const data = await response.json();

  if (!data.choices?.[0]?.message?.content) {
    throw new Error("GLM API 返回格式异常");
  }

  let result = data.choices[0].message.content;

  // GLM 返回的可能包含 tool_calls，我们需要从搜索结果中提取信息
  if (data.choices[0].message.tool_calls) {
    const searchResults = [];
    for (const tc of data.choices[0].message.tool_calls) {
      if (tc.type === "web_search" && tc.web_search?.results) {
        for (const r of tc.web_search.results) {
          searchResults.push({
            title: r.title || "",
            snippet: r.snippet || r.content || "",
            url: r.url || r.link || "",
          });
        }
      }
    }
    if (searchResults.length > 0) {
      return JSON.stringify(searchResults);
    }
  }

  return result;
}
