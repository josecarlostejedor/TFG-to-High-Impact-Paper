import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
let pdf: any;
try {
  pdf = require("pdf-parse");
} catch (e) {
  console.error("Failed to load pdf-parse:", e);
}

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
  app.post("/api/parse-file", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ 
          error: err.code === 'LIMIT_FILE_SIZE' ? "File too large (max 10MB)" : err.message 
        });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const buffer = req.file.buffer;
      const mimeType = req.file.mimetype;
      const fileName = req.file.originalname;

      console.log(`Parsing file: ${fileName} (${mimeType}), size: ${buffer.length} bytes`);

      let text = "";
      if (mimeType === "application/pdf") {
        const parsePdf = typeof pdf === 'function' ? pdf : pdf?.default;
        if (!parsePdf) {
          throw new Error("PDF parsing engine is not initialized.");
        }
        
        try {
          const data = await parsePdf(buffer);
          text = data.text;
          if (!text || text.trim().length === 0) {
            throw new Error("PDF seems to be empty or contains only images.");
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

      return res.json({ text });
    } catch (error: any) {
      console.error("Global Error parsing file:", error);
      return res.status(500).json({ error: `Server error parsing file: ${error.message}` });
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

  // Final error handler to catch anything else and return JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Express Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({ 
      error: "A critical server error occurred. Please try again with a smaller or different file." 
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
