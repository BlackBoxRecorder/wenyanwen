import { Router } from "express";
import { listFiles, readFile, createFile, updateFile, deleteFile } from "../lib/file-manager.js";

const router = Router();

// GET /api/files — 列出所有文件（支持 ?category= 筛选）
router.get("/", async (_req, res) => {
  try {
    const category = _req.query.category || null;
    const files = await listFiles(category);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:category/:filename — 读取文件内容
router.get("/:category/:filename", async (req, res) => {
  try {
    const { category, filename } = req.params;
    const data = await readFile(category, filename);
    res.json(data);
  } catch (err) {
    if (err.code === "ENOENT" || err.message.includes("不存在")) {
      res.status(404).json({ error: "文件不存在" });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});

// POST /api/files — 创建新文件
router.post("/", async (req, res) => {
  try {
    const { category, author, title, content } = req.body;
    if (!category || !author || !title) {
      return res.status(400).json({ error: "缺少必要参数: category, author, title" });
    }
    const result = await createFile(category, author, title, content || "");
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/files/:category/:filename — 保存文件内容
router.put("/:category/:filename", async (req, res) => {
  try {
    const { category, filename } = req.params;
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: "缺少 content 字段" });
    }

    await updateFile(category, filename, content);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/files/:category/:filename — 删除文件
router.delete("/:category/:filename", async (req, res) => {
  try {
    const { category, filename } = req.params;
    await deleteFile(category, filename);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
