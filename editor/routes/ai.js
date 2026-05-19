import { Router } from "express";
import { callDeepSeek, callGLMSearch } from "../lib/ai-client.js";

const router = Router();

// POST /api/ai/generate — AI 生成全文
router.post("/generate", async (req, res) => {
  try {
    const { title, author, type } = req.body;
    if (!title || !author || !type) {
      return res
        .status(400)
        .json({ error: "缺少必要参数: title, author, type" });
    }
    if (!["shi", "ci", "wen"].includes(type)) {
      return res.status(400).json({ error: "type 必须是 shi、ci 或 wen" });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return res
        .status(503)
        .json({ error: "AI 服务未配置，请设置 DEEPSEEK_API_KEY 环境变量" });
    }

    const content = await callDeepSeek(title, author, type);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/search — GLM 联网搜索参考资料
router.post("/search", async (req, res) => {
  try {
    const { title, author } = req.body;
    if (!title) {
      return res.status(400).json({ error: "缺少 title 参数" });
    }
    if (!process.env.GLM_API_KEY) {
      return res
        .status(503)
        .json({ error: "搜索服务未配置，请设置 GLM_API_KEY 环境变量" });
    }

    const results = await callGLMSearch(title, author || "");
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
