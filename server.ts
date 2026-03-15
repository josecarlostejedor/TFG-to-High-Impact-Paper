import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";
import fs from "fs";

const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to parse files
  app.post("/api/parse-file", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    try {
      let text = "";
      if (mimeType === "application/pdf") {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        text = data.text;
      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
      } else {
        text = fs.readFileSync(filePath, "utf-8");
      }

      // Clean up
      fs.unlinkSync(filePath);

      res.json({ text });
    } catch (error) {
      console.error("Error parsing file:", error);
      res.status(500).json({ error: "Failed to parse file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
