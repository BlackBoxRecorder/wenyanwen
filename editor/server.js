import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

import filesRouter from "./routes/files.js";
import aiRouter from "./routes/ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

const app = express();
const PORT = process.env.EDITOR_PORT || 3089;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 静态文件服务
app.use(express.static(join(__dirname, "public")));
app.use("/vendor/assets", express.static(join(PROJECT_ROOT, "vendor", "wyw", "src", "assets")));

// API 路由
app.use("/api/files", filesRouter);
app.use("/api/ai", aiRouter);

// 落地页重定向到编辑器
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// 启动检查
function startupChecks() {
  const wywdocsPath = join(PROJECT_ROOT, "wywdocs");
  const browserJsPath = join(PROJECT_ROOT, "vendor", "wyw", "src", "assets", "wyw-browser.js");

  if (!existsSync(wywdocsPath)) {
    console.warn("WARNING: wywdocs/ 目录未找到，文件管理功能可能无法正常工作");
  }

  if (!existsSync(browserJsPath)) {
    console.warn("WARNING: wyw-browser.js 未构建，预览功能可能无法工作");
    console.warn("  请执行: cd vendor/wyw && npm run build:browser");
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn("WARNING: DEEPSEEK_API_KEY 未设置，AI 生成功能将不可用");
  }

  if (!process.env.GLM_API_KEY) {
    console.warn("WARNING: GLM_API_KEY 未设置，联网搜索功能将不可用");
  }
}

startupChecks();

app.listen(PORT, () => {
  console.log(`\n  文言文编辑器已启动: http://localhost:${PORT}\n`);
});
