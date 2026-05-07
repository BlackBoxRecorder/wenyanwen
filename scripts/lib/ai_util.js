/**
 * AI 工具模块
 * 提供生成文言文相关的公共常量和函数
 */

import { writeFile, mkdir, access } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 类型到目录的映射
export const TYPE_TO_DIR = {
  shi: "shi",
  ci: "ci",
  wen: "wen",
};

// 类型到中文名称的映射
export const TYPE_NAMES = {
  shi: "诗",
  ci: "词",
  wen: "文",
};

// 类型中文名到英文的映射
export const TYPE_CN_TO_EN = {
  诗: "shi",
  词: "ci",
  文言文: "wen",
};

/**
 * 构建 Prompt
 * @param {string} title 作品标题
 * @param {string} author 作者姓名
 * @param {string} type 作品类型 (shi/ci/wen)
 */
export function buildPrompt(title, author, type) {
  const typeName = TYPE_NAMES[type];

  const formatGuide =
    type === "wen"
      ? `
格式要求（文言文散文）：

一、Frontmatter（文件开头元数据，必须）：
---
title: 文章标题
author: 作者姓名
dynasty: 所属朝代
---

只支持 title、author、dynasty 三个字段。

二、内联标记语法（优先级从高到低）：
1. 注音+注释（多字）：[{字|拼音}{字}...](释义)
   例：[{邺|yè}{城}{戍|shù}](三个儿子在邺城服役)
2. 注音：{字|拼音}，拼音用小写字母+Unicode声调符号
   例：{仙|xiān}、{谪|zhé}
3. 注释：[词](释义)，为生僻词或典故添加
   例：[陋室](简陋的屋子)、[滕子京](范仲淹友人)
4. 着重：*文本*，用于强调人名、地名等
   例：*孔子*、*岳阳楼*

⚠️ 严禁的格式错误（必须避免）：
- ❌ 词(释义)  — 裸圆括号不是注释！释义必须放在方括号后的圆括号中
- ✅ [词](释义) — 正确的注释格式
- ❌ 尔来(从那时以来) — 错误！裸括号不会被解析为注释
- ✅ [尔来](从那时以来) — 正确！
- ❌ [{巉|chán}岩](释义) — 错误！[]内每个字都必须用{}包裹，未注音的字也要写{字}
- ✅ [{巉|chán}{岩}](释义) — 正确！岩虽不注音也要用{岩}包裹

三、块级标记语法：
1. 段落：普通文本行，段落间用空行分隔
2. 译文：以 >> 开头，紧跟在文言文段落之后，自动与上文配对
3. 引用块：以 > 开头，用于引用名言
4. 分隔线：三个连字符 --- 独占一行，用于章节分隔
5. 标题：# 一级标题、## 二级标题、### 三级标题

四、段落与译文配对格式：
每个文言文段落后紧跟 >> 译文，空行分隔不同段落组。

示例：
---
title: 陋室铭
author: 刘禹锡
dynasty: 唐
---

山不在高，有{仙|xiān}则名。水不在深，有{龙|lóng}则{灵|líng}。[斯](这)是[陋室](简陋的屋子)，惟吾[德馨](品德高尚)。
>> 山不在于有多高，有了仙人居住就会出名。水不在于有多深，有了龙的存在就会有灵气。这是一间简陋的屋子，只因我的品德好就不感到简陋了。

---

予独爱莲之出[淤](污泥)泥而不染，[{濯|zhuó}](洗涤)清涟而不[妖](美丽而不端庄)。
>> 我唯独喜爱莲花从淤泥中长出却不被污染，经过清水的洗涤却不显得妖媚。

> 先天下之忧而忧，后天下之乐而乐。
`
      : `
格式要求（诗/词）：

一、Frontmatter（文件开头元数据，必须）：
---
title: 作品标题
author: 作者姓名
dynasty: 所属朝代
---

只支持 title、author、dynasty 三个字段。

二、诗词使用 ::: poetry 围栏块包裹，内部结构：
- # 标题（首个 # 行为主标题）
- :: [朝代]作者（元信息行）
- ## 子标题（次级标题，如"其一""其二"等）
- 正文每行独立，空行分隔不同段落
- 以 ::: 结束围栏

三、内联标记语法（优先级从高到低）：
1. 注音+注释（多字）：[{字|拼音}{字}...](释义)
   例：[{箬|ruò}{笠}](斗笠)、[{邺|yè}{城}{戍|shù}](三个儿子在邺城服役)
2. 注音+注释（单字）：[{字|拼音}](释义)
   例：[{濯|zhuó}](洗涤)
3. 注音：{字|拼音}，拼音用小写字母+Unicode声调符号
   例：{仙|xiān}、{淘|táo}
4. 注释：[词](释义)，为生僻词或典故添加
   例：[风流人物](杰出不凡的人物)
5. 着重：*文本*，用于强调
   例：*一男*

⚠️ 严禁的格式错误（必须避免）：
- ❌ 词(释义)  — 裸圆括号不是注释！释义必须放在方括号后的圆括号中
- ✅ [词](释义) — 正确的注释格式
- ❌ 尔来(从那时以来) — 错误！裸括号不会被解析为注释
- ✅ [尔来](从那时以来) — 正确！
- ❌ [{巉|chán}岩](释义) — 错误！[]内每个字都必须用{}包裹，未注音的字也要写{字}
- ✅ [{巉|chán}{岩}](释义) — 正确！岩虽不注音也要用{岩}包裹

示例：
---
title: 念奴娇·赤壁怀古
author: 苏轼
dynasty: 宋
---

::: poetry
# 念奴娇·赤壁怀古
:: [宋]苏轼

大江东去，浪{淘|táo}尽，千古[风流人物](杰出不凡的人物)。
故{垒|lěi}西边，人道是，三国周郎[赤壁](地名，在今湖北赤壁市)。
乱石穿空，惊涛拍岸，卷起千堆雪。
江山如画，一时多少{豪|háo}杰。

遥想[{公}{瑾|jǐn}](指周瑜，字公瑾)当年，小乔初嫁了，雄姿英发。
羽扇{纶|guān}巾，谈笑间，[{樯|qiáng}{橹|lǔ}](代指曹操的水军)灰飞烟灭。
故国[神游](在想象中游历)，多情应笑我，早生{华|huā}发。
人生如梦，一尊还[{酹|lèi}](把酒浇在地上，表示祭奠)江月。
:::
`;

  return `你是一位精通中国古典文学的专家。请生成${typeName}"《${title}》"（作者：${author}）的完整内容，并按照指定的 .wyw 格式输出。

${formatGuide}

请直接输出 .wyw 格式的完整内容，不要添加任何解释或说明。要求：
1. 内容必须准确，符合历史原文
2. 为生僻字（非常用字）添加注音 {字|拼音}，拼音用小写字母+Unicode声调符号
3. 为重要词语、生僻字词、典故添加注释 [词](释义)
4. 生僻字同时需要注音和注释时，使用 [{字|拼音}](释义) 或 [{字|拼音}{字}...](释义) 组合语法
5. 译文要准确、流畅、易懂，只有文言文散文需要 >> 译文，诗、词不需要译文
6. 包含完整的 frontmatter 元数据（title、author、dynasty）
7. 严禁使用裸圆括号 词(释义) 作为注释，注释必须使用 [词](释义) 格式
8. 使用 [{字|拼音}{字}...](释义) 时，[]内每个字都必须用{}包裹，未注音的字也要写{字}，如[{巉|chán}{岩}]

现在请生成${typeName}"《${title}》"（作者：${author}）的 .wyw 格式内容：`;
}

/**
 * 调用大语言模型
 * @param {string} endpoint API 端点
 * @param {string} apiKey API Key
 * @param {string} model 模型名称
 * @param {string} prompt Prompt 内容
 */
export async function callLLM(endpoint, apiKey, model, prompt) {
  const url = `${endpoint}/chat/completions`;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    // 关闭思考模式（对于支持此参数的模型）
    extra_body: {
      enable_thinking: true,
    },
  };

  console.log(`正在调用模型 ${model}...`);

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
    throw new Error(
      `API 调用失败: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("API 返回格式异常");
  }

  return data.choices[0].message.content;
}

/**
 * 清理 LLM 输出，提取 .wyw 内容
 * @param {string} content LLM 返回的内容
 */
export function cleanContent(content) {
  // 移除可能的 markdown 代码块标记
  let cleaned = content.trim();

  // 移除开头的 ```wyw 或 ```
  if (cleaned.startsWith("```wyw")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  // 移除结尾的 ```
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

/**
 * 生成文件名
 * @param {string} title 标题
 * @param {string} author 作者
 */
export function generateFileName(title, author) {
  // 清理作者名和标题中的不安全字符
  const safeAuthor = author
    .replace(/[\\/:"*?<>|]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 20);
  const safeTitle = title
    .replace(/[\\/:"*?<>|]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 30);

  return `${safeAuthor}_${safeTitle}.wyw`;
}

/**
 * 保存 .wyw 文件
 * @param {string} title 标题
 * @param {string} author 作者
 * @param {string} type 类型
 * @param {string} content 内容
 * @param {string} outputDir 输出目录
 */
export async function saveWywFile(title, author, type, content, outputDir) {
  const subDir = TYPE_TO_DIR[type];
  const targetDir = join(outputDir, subDir);
  const fileName = generateFileName(title, author);
  const filePath = join(targetDir, fileName);

  // 确保目录存在
  await mkdir(targetDir, { recursive: true });

  // 写入文件
  await writeFile(filePath, content, "utf-8");

  return filePath;
}

/**
 * 检查文件是否存在
 * @param {string} filePath 文件路径
 */
export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
