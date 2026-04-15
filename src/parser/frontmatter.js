// YAML Frontmatter 解析器
// 提取 --- 之间的键值对元数据

/**
 * 解析 .wyw 文件的 frontmatter 部分
 * @param {string} source - 完整的 .wyw 源文本
 * @returns {{ meta: Object, body: string }}
 */
export function parseFrontmatter(source) {
  const defaultMeta = {
    title: '',
    author: '',
    dynasty: '',
    source: '',
    layout: 'ancient',
  };

  const trimmed = source.trimStart();

  // 检查是否以 --- 开头
  if (!trimmed.startsWith('---')) {
    return { meta: defaultMeta, body: source };
  }

  // 查找结束的 ---
  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { meta: defaultMeta, body: source };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim(); // 跳过 \n---

  // 简单的 YAML 键值解析（不支持嵌套）
  const meta = { ...defaultMeta };
  for (const line of yamlBlock.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value) {
      meta[key] = value;
    }
  }

  return { meta, body };
}
