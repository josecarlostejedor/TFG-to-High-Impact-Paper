import express from "express";
import { extractTextFromPDF, extractTextFromDocx } from "../src/lib/parser";

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
    
    if (base64.length > 4.4 * 1024 * 1024) {
      return res.status(413).json({ 
        error: "El archivo es demasiado grande para el procesamiento en la nube (límite de 4.5MB excedido en Base64). Por favor, intenta copiar y pegar el texto directamente." 
      });
    }
    
    let buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch (e: any) {
      console.error("Base64 decoding failed:", e);
      return res.status(400).json({ error: `Datos de archivo corruptos (Base64 inválido): ${e.message}` });
    }

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
    console.error("Global Error parsing file in API:", error);
    // Return a more descriptive error if it's a module resolution issue
    const isModuleError = error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find module');
    return res.status(500).json({ 
      error: isModuleError 
        ? `Error de configuración del servidor (Módulo no encontrado: ${error.message}). Por favor, contacta con soporte.`
        : `Error del servidor al procesar el archivo: ${error.message}.` 
    });
  }
});

export default app;
