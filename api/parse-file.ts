import { extractTextFromPDF, extractTextFromDocx } from "../src/lib/parser";
import { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { base64, mimeType, fileName } = req.body;
    
    console.log(`API Request: ${req.method} ${req.url}`);

    if (!base64) {
      console.error("No base64 data in request body");
      return res.status(400).json({ error: "No file data received" });
    }

    console.log(`Parsing file: ${fileName} (${mimeType}). Base64 length: ${base64.length}`);
    
    // Vercel limit is 4.5MB. Base64 is ~1.33x. 
    // 4.5MB / 1.33 = ~3.38MB.
    // We already check this in the frontend, but let's be safe.
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
    const lowerFileName = (fileName || "").toLowerCase();

    if (mimeType === "application/pdf" || lowerFileName.endsWith('.pdf')) {
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
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerFileName.endsWith('.docx')) {
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
    return res.status(500).json({ 
      error: `Error del servidor al procesar el archivo: ${error.message}.` 
    });
  }
}
