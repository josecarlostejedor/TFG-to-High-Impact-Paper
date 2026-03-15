import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

// Increase limit to 10MB for TFG documents
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to parse files
  app.post("/api/parse-file", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const buffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const fileName = req.file.originalname;

    console.log(`Parsing file: ${fileName} (${mimeType}), size: ${buffer.length} bytes`);

    try {
      let text = "";
      if (mimeType === "application/pdf") {
        try {
          const data = await pdf(buffer);
          text = data.text;
          if (!text || text.trim().length === 0) {
            throw new Error("PDF seems to be empty or contains only images (OCR not supported yet).");
          }
        } catch (pdfError: any) {
          console.error("PDF Parse Error:", pdfError);
          return res.status(422).json({ error: `Could not extract text from PDF: ${pdfError.message}` });
        }
      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: buffer });
        text = result.value;
      } else {
        text = buffer.toString("utf-8");
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Error parsing file:", error);
      res.status(500).json({ error: `Server error parsing file: ${error.message}` });
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
