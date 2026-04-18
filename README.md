# 文言文标记语言编译器 (wenyanwen)

将 `.wyw` 文件编译为排版精美的 HTML 页面，支持注音、注释、译文等文言文阅读辅助功能。

## 功能特性

- **注音标注**：使用 Ruby 标注为汉字添加拼音
- **词语注释**：悬停查看生词释义
- **现代文翻译**：段落对照式译文展示
- **明暗主题**：支持自动/浅色/深色主题切换
- **诗词围栏**：专门的诗词排版支持

## 安装

```bash
npm install
```

## 命令行使用

### 基本命令

```bash
# 编译单个文件
node bin/wyw.js build examples/lousiming.wyw

# 指定输出目录
node bin/wyw.js build examples/lousiming.wyw -o output/

# 编译多个文件
node bin/wyw.js build examples/*.wyw -o examples/dist/
```

### 编译选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-o, --output <dir>` | 指定输出目录 | `-o dist/` |
| `--inline` | 将 CSS/JS 内联到 HTML 中 | `--inline` |
| `-w, --watch` | 监听文件变化自动重编译 | `-w` |
| `--theme <mode>` | 默认主题 (auto/light/dark) | `--theme dark` |
| `--show-translation` | 默认显示译文（默认开启） | `--show-translation` |
| `--no-show-translation` | 默认隐藏译文 | `--no-show-translation` |

### 监听模式

开发时开启监听模式，文件修改后自动重新编译：

```bash
node bin/wyw.js build examples/lousiming.wyw -o examples/dist/ -w
```

### 创建模板

快速创建一个 `.wyw` 模板文件：

```bash
node bin/wyw.js init
```

这会生成 `template.wyw` 文件，包含完整的语法示例。

## 示例

项目 `examples/` 目录下包含多个示例文件：

```bash
# 编译所有示例
npm run build:examples

# 或手动编译
node bin/wyw.js build examples/lousiming.wyw -o examples/dist/
```

编译后打开 `examples/dist/lousiming.html` 查看效果。

## 标记语法简介

详细语法说明请参阅 [docs/syntax-guide.md](docs/syntax-guide.md)。

## 项目结构

```
wenyanwen/
├── bin/wyw.js          # CLI 入口
├── src/
│   ├── cli.js          # 命令行逻辑
│   ├── index.js        # 编译器主入口
│   ├── parser/         # 解析器
│   └── renderer/       # HTML 渲染器
├── examples/           # 示例文件
├── docs/               # 文档
└── test/               # 测试
```

## 许可证

MIT
