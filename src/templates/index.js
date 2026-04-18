// Handlebars 模板加载器
// 读取并编译 .hbs 模板文件

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = __dirname;

// 缓存已编译的模板
const templateCache = new Map();

/**
 * 加载并编译 Handlebars 模板
 * @param {string} name - 模板名称（不含 .hbs 扩展名）
 * @returns {Function} - 编译后的模板函数
 */
export function loadTemplate(name) {
  if (templateCache.has(name)) {
    return templateCache.get(name);
  }

  const templatePath = join(TEMPLATES_DIR, `${name}.hbs`);
  const source = readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(source);

  templateCache.set(name, template);
  return template;
}

// 导出 Handlebars 实例，便于注册自定义 helper
export { Handlebars };
