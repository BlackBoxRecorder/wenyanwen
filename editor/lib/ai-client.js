import { buildPrompt, cleanContent } from "./ai-util.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4";
const GLM_MODEL = "glm-4.7-flash";

/**
 * 调用 DeepSeek API
 * @param {string} title - 作品标题
 * @param {string} author - 作者
 * @param {string} type - 作品类型 (shi/ci/wen)
 * @returns {Promise<string>}
 */
export async function callDeepSeek(title, author, type) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("未设置 DEEPSEEK_API_KEY 环境变量");
  }

  let prompt = buildPrompt(title, author, type);

  const url = `${DEEPSEEK_ENDPOINT}/chat/completions`;
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    extra_body: { enable_thinking: false },
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
    ? `请搜索关于《${title}》（作者：${author}）的原文内容、翻译、注释、赏析资料`
    : `请搜索关于《${title}》的原文内容、翻译、注释、赏析资料`;

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
