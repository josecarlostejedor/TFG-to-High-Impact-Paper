import React, { useState, useCallback } from "react";
import { 
  Upload, 
  FileText, 
  BookOpen, 
  Zap, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Loader2,
  Languages,
  FileCheck,
  RotateCcw,
  BarChart3
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";
import { analyzeTFG, generateArticle, refineArticle, type TransformationResult, type JournalRules } from "./lib/gemini";

// Configure PDF.js worker
// Using unpkg for better version reliability
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import { saveAs } from "file-saver";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function diagnoseFileIssue(file: File) {
  console.log("=== DIAGNÓSTICO DE ARCHIVO ===");
  console.log("File exists:", !!file);
  
  if (file) {
    console.log("File name:", file.name);
    console.log("File size:", file.size, "bytes");
    console.log("File type:", file.type);
    console.log("Last modified:", new Date(file.lastModified).toISOString());
  }
  
  console.log("PDF.js version:", pdfjs.version);
  console.log("Worker URL:", pdfjs.GlobalWorkerOptions.workerSrc);
  console.log("Navigator:", navigator.userAgent);
  console.log("==============================");
}

export default function App() {
  const [tfgText, setTfgText] = useState<string>("");
  const [journalName, setJournalName] = useState<string>("");
  const [journalRulesText, setJournalRulesText] = useState<string>("");
  const [modelArticleText, setModelArticleText] = useState<string>("");
  const [tfgFileName, setTfgFileName] = useState<string>("");
  const [rulesFileName, setRulesFileName] = useState<string>("");
  const [modelArticleFileName, setModelArticleFileName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<TransformationResult | null>(null);
  const [refinementInstructions, setRefinementInstructions] = useState("");
  const [activeTab, setActiveTab] = useState<keyof TransformationResult>("abstract");
  const [showManualInput, setShowManualInput] = useState(false);
  const [isIPhone, setIsIPhone] = useState(false);

  React.useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setIsIPhone(isIOS && isSafari);
  }, []);

  // Helper functions for better mobile compatibility (Safari/iOS < 14.1)
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file as ArrayBuffer"));
      reader.readAsArrayBuffer(file);
    });
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file as DataURL"));
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file as text"));
      reader.readAsText(file);
    });
  };

  const handleReset = () => {
    setTfgText("");
    setJournalName("");
    setJournalRulesText("");
    setModelArticleText("");
    setTfgFileName("");
    setRulesFileName("");
    setModelArticleFileName("");
    setResult(null);
    setRefinementInstructions("");
    setProgress(0);
    setElapsedTime(0);
    setActiveTab("abstract");
  };

  // ============================================
  // FILE PROCESSING
  // ============================================

  const extractTextFromPDFLocally = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      
      // Check for PDF header
      const header = new Uint8Array(arrayBuffer.slice(0, 5));
      const headerStr = Array.from(header).map(b => String.fromCharCode(b)).join('');
      if (headerStr !== '%PDF-') {
        throw new Error("El archivo no parece ser un PDF válido (falta la cabecera %PDF-).");
      }

      // Configure PDF.js to be as lightweight as possible
      const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: true,
        isEvalSupported: false,
        disableFontFace: true, // Reduce memory/CPU
      });
      
      const pdf = await loadingTask.promise;
      console.log(`PDF loaded locally: ${pdf.numPages} pages`);
      
      let text = '';
      const maxPages = 500; // Safety limit
      const numPages = Math.min(pdf.numPages, maxPages);
      
      if (pdf.numPages > maxPages) {
        console.warn(`PDF has too many pages (${pdf.numPages}). Limiting to ${maxPages}.`);
      }

      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item: any) => item.str)
            .join(' ');
          text += pageText + '\n';
          
          if (i % 10 === 0) console.log(`Parsed ${i}/${numPages} pages...`);
        } catch (pageErr) {
          console.warn(`Error parsing page ${i}, skipping...`, pageErr);
        }
      }
      
      if (text.trim().length === 0) {
        throw new Error("El PDF no parece contener texto extraíble (podría ser un escaneo o imagen).");
      }

      return text;
    } catch (err: any) {
      console.error("Local PDF extraction error:", err);
      if (err.name === 'PasswordException') {
        throw new Error("El PDF está protegido con contraseña. Por favor, quita la protección o usa el pegado manual.");
      }
      if (err.message && err.message.includes('Worker')) {
        throw new Error("Error al cargar el motor de PDF. Esto puede deberse a tu conexión o bloqueadores de anuncios. Por favor, usa el pegado manual.");
      }
      throw new Error(err.message || "Error en el procesamiento local del PDF");
    }
  };

  const processFileLocally = async (file: File, setText: (text: string) => void, setFileName: (name: string) => void) => {
    setIsParsing(true);
    setError(null);
    setFileName(file.name);
    
    try {
      diagnoseFileIssue(file);
      console.log(`Processing file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      
      let text = '';
      const lowerName = file.name.toLowerCase();

      // Check for unsupported formats
      if (lowerName.endsWith('.doc')) {
        throw new Error("El formato .doc (Word antiguo) no es compatible. Por favor, guarda el archivo como .docx o usa el pegado manual.");
      }
      if (lowerName.endsWith('.rtf') || lowerName.endsWith('.odt')) {
        throw new Error("Este formato de archivo no es compatible directamente. Por favor, usa el pegado manual o convierte el archivo a .docx.");
      }
      
      // 1. Archivos de texto plano
      if (file.type === 'text/plain' || lowerName.endsWith('.txt')) {
        text = await readFileAsText(file);
      }
      // 2. PDF: Intentar primero en el navegador para evitar límites de servidor
      else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // Vercel tiene un límite de 4.5MB para el cuerpo de la petición.
        // Un archivo de 3MB en Base64 ya roza los 4MB.
        const isLargeFile = file.size > 3 * 1024 * 1024;
        
        try {
          console.log("Attempting local PDF extraction...");
          text = await extractTextFromPDFLocally(file);
          console.log("Local PDF extraction succeeded!");
        } catch (localError: any) {
          console.log("Local PDF extraction failed, checking fallback...", localError);
          
          if (isLargeFile) {
            throw new Error(`El PDF es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB) y la extracción local falló. Los servidores en la nube tienen límites estrictos (4.5MB). Por favor, usa la entrada manual.`);
          }
          
          // Fallback al backend solo para archivos pequeños
          console.log("Falling back to backend parser...");
          text = await callBackendParser(file);
        }
      }
      // 3. DOCX: Intentar primero en el navegador
      else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const isLargeFile = file.size > 3 * 1024 * 1024;
        try {
          console.log("Attempting local DOCX extraction...");
          const arrayBuffer = await readFileAsArrayBuffer(file);
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
          console.log("Local DOCX extraction successful");
        } catch (docxErr) {
          console.error("Local DOCX extraction failed, checking fallback:", docxErr);
          
          if (isLargeFile) {
            throw new Error(`El archivo Word es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB) y la extracción local falló. Por favor, usa la entrada manual.`);
          }
          
          text = await callBackendParser(file);
        }
      }
      
      if (text && text.trim().length > 0) {
        setText(text);
      } else {
        throw new Error("No se pudo extraer texto del archivo. El archivo podría estar vacío o ser una imagen sin texto.");
      }
      
    } catch (err: any) {
      console.error("File processing error:", err);
      setError(`${err.message}`);
      setFileName('');
    } finally {
      setIsParsing(false);
    }
  };

  const callBackendParser = async (file: File): Promise<string> => {
    const dataUrl = await readFileAsDataURL(file);
    const base64 = dataUrl.split(',')[1];
    
    const response = await fetch(`${window.location.origin}/api/parse-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: base64,
        mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        fileName: file.name
      }),
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      let errorMessage = `Error del servidor: ${response.status}`;
      
      // Check for specific Vercel/Server limits
      if (response.status === 504) {
        errorMessage = "El servidor ha tardado demasiado (Timeout). Esto suele pasar con archivos muy grandes en Vercel. Por favor, intenta copiar y pegar el texto manualmente.";
      } else if (response.status === 413) {
        errorMessage = "El archivo es demasiado grande para enviarlo al servidor. Por favor, intenta copiar y pegar el texto directamente.";
      } else if (response.status === 500) {
        errorMessage = "Error interno del servidor (500). Es posible que el archivo sea demasiado complejo o pesado para el procesamiento en la nube. Te recomendamos usar la entrada manual (Copiar/Pegar).";
      }

      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        console.error("Could not parse error response as JSON:", responseText);
      }
      throw new Error(errorMessage);
    }
    
    const data = JSON.parse(responseText);
    return data.text;
  };

  const onDropTFG = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    await processFileLocally(file, setTfgText, setTfgFileName);
  }, []);

  const onDropRules = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    await processFileLocally(file, setJournalRulesText, setRulesFileName);
  }, []);

  const onDropModelArticle = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    await processFileLocally(file, setModelArticleText, setModelArticleFileName);
  }, []);


  // @ts-ignore
  const { getRootProps: getTFGProps, getInputProps: getTFGInputProps, isDragActive: isTFGActive } = useDropzone({ 
    onDrop: onDropTFG,
    multiple: false,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    }
  });

  // @ts-ignore
  const { getRootProps: getRulesProps, getInputProps: getRulesInputProps, isDragActive: isRulesActive } = useDropzone({ 
    onDrop: onDropRules,
    multiple: false,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    }
  });

  // @ts-ignore
  const { getRootProps: getModelProps, getInputProps: getModelInputProps, isDragActive: isModelActive } = useDropzone({ 
    onDrop: onDropModelArticle,
    multiple: false,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    }
  });

  const handleGenerate = async () => {
    if (!tfgText || !journalName || !journalRulesText) return;
    setIsGenerating(true);
    setProgress(0);
    setElapsedTime(0);
    setError(null);
    setStatusMessage("Initializing AI Engine...");
    
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
      setProgress(prev => {
        if (prev < 20) {
          setStatusMessage("Analyzing TFG structure and methodology...");
          return prev + 1;
        }
        if (prev < 45) {
          setStatusMessage(`Adapting content to ${journalName} guidelines...`);
          return prev + 0.8;
        }
        if (prev < 75) {
          setStatusMessage("Drafting high-impact manuscript sections...");
          return prev + 0.5;
        }
        if (prev < 95) {
          setStatusMessage("Performing final scientific rigor check...");
          return prev + 0.2;
        }
        setStatusMessage("Finalizing formatting and checklist...");
        return prev;
      });
    }, 500);

    try {
      const res = await generateArticle(tfgText, { 
        name: journalName, 
        rulesText: journalRulesText,
        modelArticleText: modelArticleText || undefined
      });
      setResult(res);
      setProgress(100);
      setStatusMessage("Manuscript ready!");
    } catch (err: any) {
      console.error("Generation failed:", err);
      setError(err.message || "An unexpected error occurred during generation. Please try again.");
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!result || !refinementInstructions) return;
    setIsGenerating(true);
    try {
      const currentFullText = JSON.stringify(result);
      const res = await refineArticle(currentFullText, refinementInstructions, { 
        name: journalName, 
        rulesText: journalRulesText,
        modelArticleText: modelArticleText || undefined
      });
      setResult(res);
      setRefinementInstructions("");
    } catch (error) {
      console.error("Refinement failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFullArticle = (lang: 'en' | 'es') => {
    if (!result) return;
    const content = `
TITLE: ${result.title}
KEYWORDS: ${result.keywords.join(", ")}

ABSTRACT:
${result.abstract}

INTRODUCTION:
${result.introduction}

METHODS:
${result.methods}

RESULTS:
${result.results}

DISCUSSION:
${result.discussion}

CONCLUSIONS:
${result.conclusions}

${result.acknowledgments ? `ACKNOWLEDGMENTS:
${result.acknowledgments}
` : ""}

${result.creditStatement ? `CRediT AUTHORSHIP CONTRIBUTION STATEMENT:
${result.creditStatement}
` : ""}

REFERENCES:
${result.references}

${result.tables ? `TABLES:
${result.tables}
` : ""}

VISUAL INVENTORY:
${result.visualInventory.map(item => `- ${item.id}: ${item.title}
  Type: ${item.type}
  Location: ${item.recommendedLocation}
  Format: ${item.formatRequired}
  ${item.pageNumber ? `Page Number: ${item.pageNumber}` : ""}
`).join('\n')}

COVER LETTER:
${result.coverLetter}
${result.userMessages && result.userMessages.length > 0 ? `
CONSEJOS PARA MEJORAR EL MANUSCRITO (CHECKLIST DE ALTO IMPACTO):
${result.userMessages.map((m, i) => `${i + 1}- ${m}`).join('\n')}
` : ""}
    `;
    downloadFile(content, `Manuscript_${lang}_${journalName.replace(/\s+/g, '_')}.txt`);
  };

  const downloadWordArticle = async () => {
    if (!result) return;

    const stripHtml = (text: string) => {
      return text.replace(/<[^>]*>?/gm, '');
    };

    const createParagraphs = (text: string, isReference = false, isTableList = false): (Paragraph | Table)[] => {
      if (!text) return [];
      const cleanText = stripHtml(text);
      
      // Split by new lines first
      let rawLines = cleanText.split('\n').filter(line => line.trim());
      
      // Join lines that look like they belong to the same header (e.g., "METHODS\nSTUDY\nDESIGN:")
      if (!isReference && !isTableList) {
        const joinedLines: string[] = [];
        for (let i = 0; i < rawLines.length; i++) {
          let current = rawLines[i].trim();
          
          // If current line is all uppercase and short (likely a header part)
          // and doesn't end with a colon, try to peek at the next line
          while (
            i + 1 < rawLines.length && 
            /^[A-Z\s]{2,20}$/.test(current) && 
            !current.endsWith(':') &&
            /^[A-Z\s]{2,20}:?$/.test(rawLines[i+1].trim())
          ) {
            current += " " + rawLines[i+1].trim();
            i++;
          }
          joinedLines.push(current);
        }
        rawLines = joinedLines;
      }

      // Special handling for references
      if (isReference) {
        const processedRefs: string[] = [];
        const combinedText = rawLines.join(' ');
        const splitRefs = combinedText.split(/(?=\d+[\-.]\s)/);
        splitRefs.forEach(r => {
          if (r.trim()) processedRefs.push(r.trim());
        });
        if (processedRefs.length > 0) {
          rawLines = processedRefs;
        }
      }

      // Detect and group tables
      const elements: (Paragraph | Table)[] = [];
      let i = 0;
      while (i < rawLines.length) {
        const line = rawLines[i].trim();
        
        // Table detection (starts with |)
        if (line.startsWith('|') && line.endsWith('|')) {
          const tableLines: string[] = [];
          while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
            // Skip separator lines like |---|---|
            if (!rawLines[i].trim().match(/^\|[\s\-\|]+\|$/)) {
              tableLines.push(rawLines[i].trim());
            }
            i++;
          }

          if (tableLines.length > 0) {
            const rows = tableLines.map(tLine => {
              const cells = tLine.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
              return new TableRow({
                children: cells.map(cell => new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: cell.trim(), font: "Times New Roman", size: 20 })],
                    alignment: AlignmentType.CENTER,
                  })],
                  width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  }
                }))
              });
            });

            elements.push(new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }));
            continue;
          }
        }

        // Regular paragraph
        let processedLine = line;
        if (isTableList) {
          if (!processedLine.match(/^\d+[-.]/)) {
            processedLine = `${elements.length + 1}- ${processedLine}`;
          }
        }

        const headerMatch = processedLine.match(/^([A-Z]{3,}(?:\s+[A-Z]{3,})*:)\s*(.*)/);
        const children: TextRun[] = [];
        let remainingText = processedLine;

        if (headerMatch) {
          children.push(new TextRun({
            text: headerMatch[1] + " ",
            font: "Times New Roman",
            size: 24,
            bold: true,
          }));
          remainingText = headerMatch[2];
        }

        if (remainingText) {
          const parts = remainingText.split(/(\[INSERT (?:TABLE|FIGURE) \d+\]|TABLE \d+\.?|FIGURE \d+\.?)/g);
          parts.forEach(part => {
            if (!part) return;
            const isPlaceholder = /^\[INSERT (?:TABLE|FIGURE) \d+\]$/.test(part);
            const isTableFigureText = /^(?:TABLE|FIGURE) \d+\.?$/.test(part);
            const shouldHighlight = isPlaceholder || isTableFigureText;
            
            children.push(new TextRun({ 
              text: part, 
              font: "Times New Roman", 
              size: 24,
              bold: shouldHighlight,
              color: shouldHighlight ? "800000" : undefined,
            }));
          });
        }

        elements.push(new Paragraph({
          children,
          spacing: { after: (isReference || isTableList) ? 240 : 200 },
          alignment: AlignmentType.JUSTIFIED,
        }));
        i++;
      }

      return elements;
    };

    const doc = new Document({
      sections: [
        {
          properties: {},
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: "Page ",
                      font: "Times New Roman",
                      size: 20,
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Times New Roman",
                      size: 20,
                    }),
                    new TextRun({
                      text: " of ",
                      font: "Times New Roman",
                      size: 20,
                    }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      font: "Times New Roman",
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              text: result.title,
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: result.authorMetadata,
                  font: "Times New Roman",
                  size: 20,
                  italics: true,
                }),
              ],
              spacing: { after: 400 },
            }),
            new Paragraph({
              text: "ABSTRACT",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.abstract),
            new Paragraph({
              children: [
                new TextRun({ text: "Keywords: ", bold: true, font: "Times New Roman", size: 24 }),
                new TextRun({ text: result.keywords.join(", "), font: "Times New Roman", size: 24 }),
              ],
              spacing: { before: 200, after: 400 },
            }),
            
            new Paragraph({
              text: "AT A GLANCE",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.atAGlance),

            new Paragraph({
              text: "INTRODUCTION",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.introduction),

            new Paragraph({
              text: "METHODS",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.methods),

            new Paragraph({
              text: "RESULTS",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.results),

            new Paragraph({
              text: "DISCUSSION",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.discussion),

            new Paragraph({
              text: "CONCLUSIONS",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...createParagraphs(result.conclusions),

            ...(result.acknowledgments ? [
              new Paragraph({
                text: "ACKNOWLEDGMENTS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
              }),
              ...createParagraphs(result.acknowledgments)
            ] : []),

            ...(result.creditStatement ? [
              new Paragraph({
                text: "CRediT AUTHORSHIP CONTRIBUTION STATEMENT",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
              }),
              ...createParagraphs(result.creditStatement)
            ] : []),

            new Paragraph({
              text: "REFERENCES",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              pageBreakBefore: true,
            }),
            ...createParagraphs(result.references, true),

            ...(result.tables ? [
              new Paragraph({
                text: "TABLES & FIGURES INVENTORY",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
                pageBreakBefore: true,
              }),
              ...createParagraphs(result.tables, false, true),
              new Paragraph({
                text: "Visual Elements Checklist:",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 },
              }),
              ...result.visualInventory.map(item => new Paragraph({
                children: [
                  new TextRun({ text: `[ ] ${item.id}: ${item.title}`, bold: true, font: "Times New Roman", size: 24 }),
                  new TextRun({ text: `\nLocation: ${item.recommendedLocation}`, font: "Courier New", size: 18 }),
                  new TextRun({ text: `\nFormat: ${item.formatRequired}`, font: "Courier New", size: 18 }),
                  ...(item.pageNumber ? [new TextRun({ text: `\nPage Number: ${item.pageNumber}`, font: "Courier New", size: 18 })] : []),
                ],
                spacing: { after: 200 },
              }))
            ] : []),

            new Paragraph({
              text: "COVER LETTER",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
              pageBreakBefore: true,
            }),
            ...createParagraphs(result.coverLetter),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Manuscript_${journalName.replace(/\s+/g, '_')}.docx`);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Loading Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-md w-full space-y-8">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center text-emerald-600">
                  <Zap size={32} fill="currentColor" className="animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Transforming your Research</h2>
                <p className="text-neutral-500 font-medium animate-pulse">{statusMessage}</p>
              </div>

              <div className="space-y-4">
                <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden">
                  <motion.div 
                    className="bg-emerald-600 h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex justify-between text-sm font-mono text-neutral-400">
                  <span>{Math.round(progress)}% Complete</span>
                  <span>{Math.floor(elapsedTime / 2)}s Elapsed</span>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs leading-relaxed">
                <p className="font-semibold mb-1">Note for Vercel Users:</p>
                Large documents may take up to 60 seconds to process. Please do not close this tab.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Zap size={20} fill="currentColor" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">TFG to High-Impact Paper</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-500">
            <button 
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-neutral-100 rounded-lg transition-colors text-neutral-600 font-medium"
            >
              <RotateCcw size={14} />
              New Project
            </button>
            <div className="h-4 w-px bg-neutral-200" />
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-500" />
              AI-Powered Rigor
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Journal Adaptation
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                  <FileText size={16} />
                  Paso 1: Sube tu TFG
                </div>
                <button 
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-xs text-emerald-600 hover:underline font-medium flex items-center gap-1"
                >
                  {showManualInput ? <Upload size={12} /> : <FileText size={12} />}
                  {showManualInput ? "Usar Subida de Archivo" : "Pegar Texto Manualmente"}
                </button>
              </div>

              {showManualInput ? (
                <div className="space-y-2">
                  <textarea
                    placeholder="Pega aquí el texto de tu TFG..."
                    className="w-full h-48 bg-white border border-neutral-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm"
                    value={tfgText}
                    onChange={(e) => {
                      setTfgText(e.target.value);
                      if (e.target.value) setTfgFileName("Entrada Manual");
                    }}
                  />
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-neutral-400 italic">
                      Tip: Si el lector de PDF falla, copia y pega el texto de tu documento aquí.
                    </p>
                    {tfgText && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        {tfgText.length.toLocaleString()} caracteres
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  {...getTFGProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-center",
                    isTFGActive ? "border-emerald-500 bg-emerald-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white",
                    tfgText && !showManualInput && "border-emerald-500/30 bg-emerald-50/20"
                  )}
                >
                  <input {...getTFGInputProps()} />
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", tfgText && !showManualInput ? "bg-emerald-100 text-emerald-600" : "bg-neutral-100 text-neutral-400")}>
                    {isParsing ? <Loader2 className="animate-spin" size={24} /> : (tfgText && !showManualInput ? <CheckCircle2 size={24} /> : <Upload size={24} />)}
                  </div>
                  <div>
                    <p className="font-medium">
                      {isParsing ? "Leyendo archivo..." : (tfgText && !showManualInput ? "TFG Cargado con Éxito" : "Suelta tu TFG aquí")}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">PDF, DOCX, o TXT</p>
                    {tfgFileName && !showManualInput && (
                      <div className="flex flex-col items-center gap-1 mt-2">
                        <p className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">
                          {tfgFileName}
                        </p>
                        {tfgText && (
                          <span className="text-[10px] text-neutral-400">
                            {tfgText.length.toLocaleString()} caracteres extraídos
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                <BookOpen size={16} />
                Step 2: Journal Config
              </div>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Target Journal Name (e.g. Nature, Lancet)"
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={journalName}
                  onChange={(e) => setJournalName(e.target.value)}
                />
                <div 
                  {...getRulesProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-center",
                    isRulesActive ? "border-emerald-500 bg-emerald-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white",
                    journalRulesText && "border-emerald-500/30 bg-emerald-50/20"
                  )}
                >
                  <input {...getRulesInputProps()} />
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", journalRulesText ? "bg-emerald-100 text-emerald-600" : "bg-neutral-100 text-neutral-400")}>
                    {isParsing ? <Loader2 className="animate-spin" size={24} /> : (journalRulesText ? <CheckCircle2 size={24} /> : <Upload size={24} />)}
                  </div>
                  <div>
                    <p className="font-medium">
                      {isParsing ? "Reading file..." : (journalRulesText ? "Rules Loaded Successfully" : "Upload Guide for Authors")}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">PDF or TXT</p>
                    {rulesFileName && (
                      <p className="text-xs font-mono text-emerald-600 mt-2 bg-emerald-50 px-2 py-1 rounded inline-block">
                        {rulesFileName}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                <BookOpen size={16} />
                Step 3: Model Article (Optional)
              </div>
              <div 
                {...getModelProps()} 
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-center",
                  isModelActive ? "border-emerald-500 bg-emerald-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white",
                  modelArticleText && "border-emerald-500/30 bg-emerald-50/20"
                )}
              >
                <input {...getModelInputProps()} />
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", modelArticleText ? "bg-emerald-100 text-emerald-600" : "bg-neutral-100 text-neutral-400")}>
                  {isParsing ? <Loader2 className="animate-spin" size={24} /> : (modelArticleText ? <CheckCircle2 size={24} /> : <Upload size={24} />)}
                </div>
                <div>
                  <p className="font-medium">
                    {isParsing ? "Reading file..." : (modelArticleText ? "Model Article Loaded" : "Upload Example Article")}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">For style & format analysis</p>
                  {modelArticleFileName && (
                    <p className="text-xs font-mono text-emerald-600 mt-2 bg-emerald-50 px-2 py-1 rounded inline-block">
                      {modelArticleFileName}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || isParsing || !tfgText || !journalName || !journalRulesText}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white font-semibold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex flex-col items-center justify-center gap-2 group relative overflow-hidden"
            >
              <div className="flex items-center gap-2 z-10">
                {isGenerating ? <Loader2 className="animate-spin" /> : <Zap size={18} className="group-hover:scale-110 transition-transform" />}
                {isGenerating ? "Generating..." : (isParsing ? "Waiting for files..." : "Generate High-Impact Draft")}
              </div>
              
              {!tfgText && !isParsing && tfgFileName && (
                <p className="text-[10px] text-white/80 z-10">Parsing failed. Please re-upload.</p>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm flex items-start gap-3"
              >
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <p className="font-bold">Problema con el archivo</p>
                  <p className="opacity-90 whitespace-pre-wrap leading-relaxed">{error}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => setShowManualInput(true)}
                      className="px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      <FileText size={12} />
                      Usar Entrada Manual (Copiar/Pegar)
                    </button>
                    <button
                      onClick={() => setError(null)}
                      className="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                    >
                      Intentar de nuevo
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {result && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-white rounded-2xl border border-emerald-100 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                  <AlertCircle size={18} />
                  Rigor Diagnosis
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed italic">
                  "{result.diagnosis}"
                </p>
              </motion.div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {!result ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[600px] border-2 border-dashed border-neutral-200 rounded-3xl flex flex-col items-center justify-center text-neutral-400 gap-4"
                >
                  <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center">
                    <FileText size={32} />
                  </div>
                  <p className="font-medium">Your generated manuscript will appear here</p>
                </motion.div>
              ) : (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* Result Header */}
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest">
                          <Languages size={14} />
                          Generated Manuscript for {journalName}
                        </div>
                        <h2 className="text-2xl font-bold leading-tight">{result.title}</h2>
                        
                        {result.titleProposals && result.titleProposals.length > 0 && (
                          <div className="mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Alternative Title Proposals</p>
                            <ul className="space-y-2">
                              {result.titleProposals.map((p, i) => (
                                <li key={i} className="text-sm text-neutral-600 flex gap-2">
                                  <span className="text-emerald-500 font-bold">{i + 1}.</span>
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {result.authorMetadata && (
                          <div className="mt-2 p-4 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Author Normalization (IraLIS/FECYT)</p>
                            <p className="text-xs text-neutral-600 italic leading-relaxed">
                              {result.authorMetadata}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={downloadWordArticle}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all"
                          title="Download Word Version"
                        >
                          <FileText size={18} />
                          Download Word (.docx)
                        </button>
                        <button 
                          onClick={() => downloadFullArticle('en')}
                          className="p-3 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors text-neutral-600"
                          title="Download English Version"
                        >
                          <Download size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex flex-wrap gap-2 border-b border-neutral-100 pb-4">
                      {['abstract', 'atAGlance', 'introduction', 'methods', 'results', 'discussion', 'conclusions', 'acknowledgments', 'creditStatement', 'references', 'tables', 'coverLetter'].filter(k => result[k as keyof TransformationResult]).map((key) => (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key as any)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                            activeTab === key ? "bg-emerald-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
                          )}
                        >
                          {key === 'atAGlance' ? 'At a Glance' : 
                           key === 'creditStatement' ? 'CRediT' : 
                           key}
                        </button>
                      ))}
                      <button
                        onClick={() => setActiveTab('q1Validation' as any)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize flex items-center gap-1.5",
                          activeTab === 'q1Validation' ? "bg-indigo-600 text-white" : "text-indigo-600 hover:bg-indigo-50 bg-indigo-50/50"
                        )}
                      >
                        <FileCheck size={14} />
                        Protocolo Q1
                      </button>
                      <button
                        onClick={() => setActiveTab('checklist' as any)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize flex items-center gap-1.5",
                          activeTab === 'checklist' ? "bg-emerald-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
                        )}
                      >
                        <FileCheck size={14} />
                        Checklist
                      </button>
                      {result.userMessages && result.userMessages.length > 0 && (
                        <button
                          onClick={() => setActiveTab('userMessages' as any)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize flex items-center gap-1.5 relative",
                            activeTab === 'userMessages' ? "bg-amber-600 text-white" : "text-amber-600 hover:bg-amber-50 bg-amber-50/50"
                          )}
                        >
                          <AlertCircle size={14} />
                          Mensajes al Usuario
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                        </button>
                      )}
                    </div>

                    {/* Word Count Display */}
                    {activeTab !== 'checklist' && activeTab !== 'userMessages' && activeTab !== 'tables' && typeof result[activeTab] === 'string' && (
                      <div className="flex items-center justify-between py-2 border-b border-neutral-100 mb-6">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                          Section Word Count
                        </span>
                        <span className="text-xs font-mono text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                          {(result[activeTab] as string).split(/\s+/).filter(Boolean).length} words
                        </span>
                      </div>
                    )}

                    {/* Content Area */}
                    <div className="min-h-[400px] prose prose-neutral max-w-none">
                      {activeTab === 'results' && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-xs">
                          <p className="font-bold mb-1">💡 Tip for Tables & Figures:</p>
                          The AI has identified where your TFG data should be visualized. Look for placeholders like [TABLE X]. You can ask the AI to "Convert [TABLE X] into a Markdown table" using the refinement tool below.
                        </div>
                      )}
                      {activeTab === 'q1Validation' ? (
                        <div className="space-y-6">
                          <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-2xl mb-6">
                            <h3 className="text-indigo-800 font-bold flex items-center gap-2 mb-2">
                              <FileCheck size={18} />
                              Protocolo de Validación para Revistas Q1
                            </h3>
                            <p className="text-sm text-indigo-700 leading-relaxed">
                              Este protocolo simula la revisión de un editor de revista de alto impacto (Q1). Evalúa la calidad científica, la narrativa y el rigor del manuscrito generado.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {result.q1Validation.map((item, i) => (
                              <div key={i} className="p-5 bg-white border border-neutral-200 rounded-2xl shadow-sm flex items-start gap-4">
                                <div className={cn(
                                  "mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                  item.status === 'pass' ? "bg-emerald-100 text-emerald-600" : 
                                  item.status === 'warning' ? "bg-amber-100 text-amber-600" : 
                                  "bg-red-100 text-red-600"
                                )}>
                                  {item.status === 'pass' ? <CheckCircle2 size={18} /> : 
                                   item.status === 'warning' ? <AlertCircle size={18} /> : 
                                   <AlertCircle size={18} />}
                                </div>
                                <div className="space-y-1">
                                  <h4 className="font-bold text-neutral-800">{item.criterion}</h4>
                                  <p className="text-sm text-neutral-600 leading-relaxed">{item.feedback}</p>
                                  <div className={cn(
                                    "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-2",
                                    item.status === 'pass' ? "bg-emerald-50 text-emerald-700" : 
                                    item.status === 'warning' ? "bg-amber-50 text-amber-700" : 
                                    "bg-red-50 text-red-700"
                                  )}>
                                    {item.status === 'pass' ? 'Cumplido' : 
                                     item.status === 'warning' ? 'Mejorable' : 
                                     'Crítico / Falta'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : activeTab === 'checklist' ? (
                        <div className="space-y-4">
                          {result.checklist.map((item, i) => (
                            <div key={i} className="flex items-start gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                              <div className="mt-1 w-5 h-5 rounded border border-emerald-500 flex items-center justify-center text-emerald-600">
                                <CheckCircle2 size={14} />
                              </div>
                              <span className="text-sm font-medium text-neutral-700">{item}</span>
                            </div>
                          ))}
                        </div>
                      ) : activeTab === 'userMessages' ? (
                        <div className="space-y-4">
                          <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl mb-6">
                            <h3 className="text-amber-800 font-bold flex items-center gap-2 mb-2">
                              <AlertCircle size={18} />
                              Consejos para mejorar tu manuscrito
                            </h3>
                            <p className="text-sm text-amber-700 leading-relaxed">
                              Basado en el checklist de revistas de alto impacto, he identificado algunos aspectos que podrían fortalecerse. Estos puntos no pudieron ser completados o mejorados totalmente debido a falta de información en el TFG original:
                            </p>
                          </div>
                          {result.userMessages?.map((message, i) => (
                            <div key={i} className="flex items-start gap-3 p-4 bg-white border border-amber-100 rounded-xl shadow-sm">
                              <div className="mt-1 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                                <ChevronRight size={14} />
                              </div>
                              <span className="text-sm text-neutral-700 leading-relaxed">{message}</span>
                            </div>
                          ))}
                        </div>
                      ) : activeTab === 'atAGlance' ? (
                        <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                          <h3 className="text-emerald-800 font-bold text-sm uppercase tracking-wider mb-4">Manuscript at a Glance</h3>
                          <div className="whitespace-pre-wrap text-neutral-700 leading-relaxed font-serif text-lg">
                            {result.atAGlance}
                          </div>
                        </div>
                      ) : activeTab === 'tables' ? (
                        <div className="space-y-8">
                          <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
                            <h3 className="text-emerald-800 font-bold flex items-center gap-2 mb-2">
                              <BarChart3 size={18} />
                              Visual Elements Management System
                            </h3>
                            <p className="text-sm text-emerald-700 leading-relaxed">
                              As your scientific mentor, I have identified the following visual elements required for your high-impact manuscript. Since I cannot extract images directly from PDFs, please follow this hybrid workflow:
                            </p>
                            <ol className="mt-4 space-y-2 text-xs text-emerald-800 list-decimal list-inside">
                              <li><strong>Identify:</strong> Review the inventory below for required tables and figures.</li>
                              <li><strong>Extract:</strong> Locate the corresponding data or images in your original TFG.</li>
                              <li><strong>Format:</strong> For tables, copy the raw data and use the refinement tool to ask me for specific formatting.</li>
                              <li><strong>Insert:</strong> Place high-resolution images (300 dpi) directly into your final Word document.</li>
                            </ol>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {result.visualInventory.map((item, i) => (
                              <div key={i} className="p-4 bg-white border border-neutral-200 rounded-xl shadow-sm hover:border-emerald-200 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                    item.type === 'table' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                  )}>
                                    {item.type}
                                  </span>
                                  <span className="text-[10px] font-mono text-neutral-400">{item.id}</span>
                                </div>
                                <h4 className="font-bold text-sm text-neutral-800 mb-1">{item.title}</h4>
                                <p className="text-xs text-neutral-500 mb-3 leading-relaxed">{item.description}</p>
                                <div className="space-y-1 border-t border-neutral-50 pt-2">
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-neutral-400 font-medium">Location:</span>
                                    <span className="text-neutral-600">{item.recommendedLocation}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-neutral-400 font-medium">Format:</span>
                                    <span className="text-neutral-600">{item.formatRequired}</span>
                                  </div>
                                  {item.pageNumber && (
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-neutral-400 font-medium">Page Number:</span>
                                      <span className={cn(
                                        "font-medium",
                                        item.pageNumber === "crear figura" ? "text-amber-600" : "text-neutral-600"
                                      )}>
                                        {item.pageNumber}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {result.tables && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                                <FileText size={14} />
                                Formatted Table Data
                              </div>
                              <div className="whitespace-pre-wrap text-neutral-700 leading-relaxed font-mono text-sm bg-neutral-50 p-6 rounded-2xl border border-neutral-200 overflow-x-auto">
                                {result.tables}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-neutral-700 leading-relaxed font-serif text-lg">
                          {result[activeTab] as string}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Refinement Area */}
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 space-y-6">
                    <div className="flex items-center gap-2 text-sm font-bold text-neutral-400 uppercase tracking-widest">
                      <RefreshCw size={14} />
                      Iterative Refinement
                    </div>
                    <div className="space-y-4">
                      <textarea 
                        placeholder="e.g. 'Improve the discussion to be more impactful', 'Adjust methodology to journal rules', 'Strengthen statistical analysis'..."
                        className="w-full h-32 bg-neutral-50 border border-neutral-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                        value={refinementInstructions}
                        onChange={(e) => setRefinementInstructions(e.target.value)}
                      />
                      <button 
                        onClick={handleRefine}
                        disabled={isGenerating || !refinementInstructions}
                        className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-neutral-800 disabled:bg-neutral-300 transition-all ml-auto"
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                        Refine Manuscript
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5 flex flex-col md:flex-row items-center justify-between gap-6 text-neutral-400 text-sm">
        <p>© 2026 TFG to High-Impact Paper. Built for rigorous science.</p>
        <div className="flex items-center gap-8">
          <a href="#" className="hover:text-neutral-600 transition-colors">IraLIS Normalization</a>
          <a href="#" className="hover:text-neutral-600 transition-colors">FECYT Guidelines</a>
          <a href="#" className="hover:text-neutral-600 transition-colors">ICJME Criteria</a>
        </div>
      </footer>
    </div>
  );
}
