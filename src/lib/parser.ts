import path from "path";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Polyfill for DOMMatrix and DOMPoint which are missing in Node.js but required by some builds of pdfjs-dist
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    constructor() {}
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
  };
}

if (typeof globalThis.DOMPoint === "undefined") {
  (globalThis as any).DOMPoint = class DOMPoint {
    x: number; y: number; z: number; w: number;
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x; this.y = y; this.z = z; this.w = w;
    }
    static fromPoint(p: any) { return new DOMPoint(p.x, p.y, p.z, p.w); }
  };
}

async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  console.log("Attempting extraction with pdfjs-dist...");
  const uint8Array = new Uint8Array(buffer);
  
  // Use the legacy build for Node.js compatibility
  // In some environments, the path might need to be adjusted
  let pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (e) {
    console.log("Failed to load legacy build, trying standard build...");
    pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  }
  
  const loadingTask = pdfjs.getDocument({ 
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0, // Suppress warnings
  });
  
  const pdfDocument = await loadingTask.promise;
  let fullText = "";
  
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => (item as any).str)
      .join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText;
}

let pdfParser: any = null;

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Try pdf-parse first as it's more lightweight for Node
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
