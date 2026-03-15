import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Initialize pdfjs worker
// In Node.js environment with the legacy build, we can often skip the worker or use the bundled one
// For text extraction, this is the most reliable way in Node:

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false, // Security/stability in some environments
    });
    const pdf = await loadingTask.promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  } catch (error) {
    console.error("pdfjs-dist error:", error);
    throw error;
  }
}

// Increase limit to 4MB to be safe with Vercel's 4.5MB payload limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 } 
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API to parse files
  app.post("/api/parse-file", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ 
          error: err.code === 'LIMIT_FILE_SIZE' ? "File too large (max 4MB for Vercel compatibility)" : err.message 
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
        try {
          text = await extractTextFromPDF(buffer);
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
