import * as mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// pdf-parse is a CommonJS module
const pdf = require("pdf-parse");

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    console.log(`Attempting extraction with pdf-parse. Buffer size: ${buffer.length} bytes`);
    const data = await pdf(buffer);
    
    if (!data || !data.text) {
      console.warn("pdf-parse returned no text content");
      throw new Error("No text content found in PDF");
    }
    
    console.log(`PDF extraction successful. Extracted ${data.text.length} characters.`);
    return data.text;
  } catch (error: any) {
    console.error("PDF extraction failed with pdf-parse:", error);
    throw new Error(`Could not extract text from PDF: ${error.message}`);
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    console.log(`Attempting extraction with mammoth. Buffer size: ${buffer.length} bytes`);
    const result = await mammoth.extractRawText({ buffer: buffer });
    console.log(`DOCX extraction successful. Extracted ${result.value.length} characters.`);
    return result.value;
  } catch (error: any) {
    console.error("DOCX extraction failed with mammoth:", error);
    throw new Error(`Could not extract text from Word document: ${error.message}`);
  }
}
