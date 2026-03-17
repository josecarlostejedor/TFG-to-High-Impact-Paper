import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { extractTextFromPDF, extractTextFromDocx } from "./src/lib/parser.js";

// Increase limit to 4MB to be safe with Vercel's 4.5MB payload limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 } 
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Safari compatibility headers
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API to parse files (Base64 JSON version)
  app.post("/api/parse-file", async (req, res) => {
    try {
      const { base64, mimeType, fileName } = req.body;

      if (!base64) {
        return res.status(400).json({ error: "No file data received" });
      }

      console.log(`Parsing file: ${fileName} (${mimeType}) via Base64. Size: ${base64.length} chars`);
      
      // Vercel has a 4.5MB limit for the entire request body.
      // Base64 is roughly 1.33x the original size.
      // 4.5MB is ~4,718,592 bytes.
      if (base64.length > 4.4 * 1024 * 1024) {
        return res.status(413).json({ 
          error: "El archivo es demasiado grande para el procesamiento en la nube (límite de 4.5MB excedido en Base64). Por favor, intenta copiar y pegar el texto directamente." 
        });
      }
      
      // Convert Base64 to Buffer
      let buffer;
      try {
        buffer = Buffer.from(base64, 'base64');
      } catch (e) {
        return res.status(400).json({ error: "Datos de archivo corruptos (Base64 inválido)" });
      }

      let text = "";
      if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith('.pdf')) {
        try {
          text = await extractTextFromPDF(buffer);
          if (!text || text.trim().length === 0) {
            throw new Error("PDF seems to be empty or contains only images.");
          }
        } catch (pdfError: any) {
          console.error("PDF Parse Error:", pdfError);
          return res.status(422).json({ error: `Could not extract text from PDF: ${pdfError.message}` });
        }
      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.toLowerCase().endsWith('.docx')) {
        text = await extractTextFromDocx(buffer);
      } else {
        text = buffer.toString("utf-8");
      }

      return res.json({ text });
    } catch (error: any) {
      console.error("Global Error parsing file:", error);
      return res.status(500).json({ 
        error: `Error del servidor al procesar el archivo: ${error.message}. Esto suele ocurrir con archivos muy complejos. Te recomendamos usar el pegado manual.` 
      });
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
