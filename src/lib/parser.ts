import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// pdf-parse is a CommonJS module
const pdf = require("pdf-parse");

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    console.log("Attempting extraction with pdf-parse...");
    const data = await pdf(buffer);
    
    if (!data || !data.text) {
      throw new Error("No text content found in PDF");
    }
    
    return data.text;
  } catch (error: any) {
    console.error("PDF extraction failed with pdf-parse:", error);
    throw new Error(`Could not extract text from PDF: ${error.message}`);
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buffer });
  return result.value;
}
