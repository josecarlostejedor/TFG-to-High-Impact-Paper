import express from "express";
import { extractTextFromPDF, extractTextFromDocx } from "../src/lib/parser.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), environment: "vercel" });
});

app.post("/api/parse-file", async (req, res) => {
  try {
    const { base64, mimeType, fileName } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "No file data received" });
    }

    console.log(`Parsing file: ${fileName} (${mimeType}) via Vercel Function. Size: ${base64.length} chars`);
    
    if (base64.length > 6 * 1024 * 1024) {
      console.warn("Payload size might exceed Vercel limits");
    }
    
    const buffer = Buffer.from(base64, 'base64');

    let text = "";
    if (mimeType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
      try {
        text = await extractTextFromPDF(buffer);
        if (!text || text.trim().length === 0) {
          return res.status(422).json({ 
            error: "El PDF no contiene texto extraíble. Si es un PDF escaneado, por favor usa una herramienta de OCR o pega el texto manualmente." 
          });
        }
      } catch (pdfError: any) {
        console.error("PDF Parse Error:", pdfError);
        return res.status(422).json({ error: `Error al leer el PDF: ${pdfError.message}` });
      }
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || (fileName && fileName.toLowerCase().endsWith('.docx'))) {
      try {
        text = await extractTextFromDocx(buffer);
      } catch (docxError: any) {
        console.error("DOCX Parse Error:", docxError);
        return res.status(422).json({ error: `Error al leer el archivo Word: ${docxError.message}` });
      }
    } else {
      text = buffer.toString("utf-8");
    }

    return res.json({ text });
  } catch (error: any) {
    console.error("Global Error parsing file:", error);
    return res.status(500).json({ error: `Error interno del servidor: ${error.message}` });
  }
});

export default app;
