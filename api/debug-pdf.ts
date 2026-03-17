import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const diagnostics: any = {
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    platform: process.platform,
    timestamp: new Date().toISOString(),
    pdfLibrary: 'unknown',
    steps: []
  };
  
  try {
    // Paso 1: Verificar versión de librería PDF
    diagnostics.steps.push('Verificando librería');
    try {
      // In ESM/TS we might need to be careful with JSON imports
      // For a debug endpoint, we can try a dynamic import or just check if the function exists
      diagnostics.pdfLibrary = typeof pdf === 'function' ? 'pdf-parse loaded' : 'pdf-parse NOT a function';
    } catch (e: any) {
      diagnostics.pdfError = e.message;
    }
    
    // Paso 2: Verificar que podemos recibir datos
    diagnostics.steps.push('Recibiendo datos');
    if (req.method !== 'POST') {
       throw new Error(`Method ${req.method} not allowed. Use POST.`);
    }
    
    if (!req.body || !req.body.file) {
      throw new Error('No se recibió el archivo en req.body.file');
    }
    diagnostics.fileSize = req.body.file.length;
    
    // Paso 3: Convertir a buffer
    diagnostics.steps.push('Convirtiendo a buffer');
    const dataBuffer = Buffer.from(req.body.file, 'base64');
    diagnostics.bufferSize = dataBuffer.length;
    
    // Paso 4: Intentar procesar con timeout
    diagnostics.steps.push('Procesando PDF');
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout after 5000ms')), 5000);
    });
    
    const pdfPromise = pdf(dataBuffer);
    const data = await Promise.race([pdfPromise, timeoutPromise]) as any;
    
    // Éxito
    diagnostics.success = true;
    diagnostics.pages = data.numpages;
    diagnostics.textLength = data.text.length;
    diagnostics.memoryAfter = process.memoryUsage();
    
  } catch (error: any) {
    diagnostics.error = {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      step: diagnostics.steps[diagnostics.steps.length - 1]
    };
  }
  
  // Siempre devolver diagnóstico, incluso si hay error
  res.status(200).json(diagnostics);
}
