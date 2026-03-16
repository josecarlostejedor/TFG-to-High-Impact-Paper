import path from "path";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import * as pdfjs from "pdfjs-dist";

async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  console.log("Attempting extraction with pdfjs-dist...");
  const uint8Array = new Uint8Array(buffer);
  
  // Fix for "baseUrl" parameter must be specified warning
  // We try to find the fonts in node_modules
  let standardFontDataUrl = "";
  let cMapUrl = "";
  
  try {
    // Try different possible paths for fonts
    const possiblePaths = [
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"),
      path.join(process.cwd(), "..", "node_modules", "pdfjs-dist", "standard_fonts"), // For api/ folder
      path.join("/var/task", "node_modules", "pdfjs-dist", "standard_fonts"), // For Vercel
    ];
    
    for (const p of possiblePaths) {
      if (p.includes("node_modules")) {
        standardFontDataUrl = p + path.sep;
        break;
      }
    }
    
    cMapUrl = standardFontDataUrl.replace("standard_fonts", "cmaps");
  } catch (e) {
    console.warn("Could not determine font paths:", e);
  }
  
  const loadingTask = pdfjs.getDocument({ 
    data: uint8Array,
    standardFontDataUrl: standardFontDataUrl || undefined,
    cMapUrl: cMapUrl || undefined,
    cMapPacked: true,
    useSystemFonts: true,
  });
  
  const pdfDocument = await loadingTask.promise;
  let fullText = "";
  
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText;
}

let pdfParser: any = null;

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Try pdf-parse first
  try {
    if (!pdfParser) {
      try {
        const r = require("pdf-parse");
        pdfParser = r.default || r;
      } catch (e) {
        console.error("Could not load pdf-parse via require:", e);
      }
    }

    if (typeof pdfParser === "function") {
      const data = await pdfParser(buffer);
      if (data && data.text) return data.text;
    }
  } catch (e) {
    console.error("pdf-parse failed, falling back to pdfjs-dist:", e);
  }

  // Fallback to pdfjs-dist
  try {
    return await extractTextWithPdfJs(buffer);
  } catch (error: any) {
    console.error("All PDF extraction methods failed:", error);
    throw new Error(`Could not extract text from PDF: ${error.message}`);
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buffer });
  return result.value;
}
