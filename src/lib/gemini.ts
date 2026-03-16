import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  try {
    return process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  } catch {
    return (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export interface JournalRules {
  name: string;
  rulesText: string;
  modelArticleText?: string;
}

export interface TransformationResult {
  title: string;
  titleProposals: string[]; // 3 proposals for the user to choose
  authorMetadata: string; // Normalization recommendations (IraLIS, FECYT, ORCID)
  abstract: string; // Structured: Background, Objective, Study Design, Results, Conclusion
  keywords: string[];
  atAGlance: string; // Three points: Why conducted, Key findings, What adds
  introduction: string;
  methods: string; // Subsections: Study Population, Data Collection, Exposure, Statistical Analysis
  results: string; // Including [TABLE X] and [FIGURE X] placeholders
  discussion: string; // Subsections: Principal Findings, Context, Clinical Implications, Strengths and Limitations
  conclusions: string;
  acknowledgments?: string;
  creditStatement?: string;
  references: string; // Each on a new line, NO HTML TAGS
  tables?: string; // Extracted and formatted tables, NO HTML TAGS
  visualInventory: {
    type: 'table' | 'figure';
    id: string;
    title: string;
    description: string;
    recommendedLocation: string;
    formatRequired: string;
  }[];
  coverLetter: string;
  checklist: string[];
  diagnosis: string;
}

export async function analyzeTFG(tfgText: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze the following undergraduate thesis (TFG) and extract its core components: 
  objective, methodology, key results, and main conclusions. 
  
  SISTEMA DE DIAGNÓSTICO ESTADÍSTICO:
  Identify the statistical tests used and evaluate their appropriateness. 
  Check if p-values are exact, if effect sizes are reported, and if assumptions (normality, etc.) are mentioned.
  
  Provide a "rigor diagnosis" identifying weaknesses for a high-impact journal, specifically focusing on methodology and statistics.
  
  TFG Text: ${tfgText.substring(0, 30000)}...`; // Limit text for safety

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          diagnosis: { type: Type.STRING },
        },
        required: ["summary", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function generateArticle(tfgText: string, journalRules: JournalRules) {
  const model = "gemini-3-flash-preview";
  const prompt = `You are a world-class scientific editor and researcher specialized in high-impact medical journals. 
  
  TASK: Transform the provided Undergraduate Thesis (TFG) into a COMPREHENSIVE, DEEP, and RIGOROUS Original Research article for the journal "${journalRules.name}".
  
  CRITICAL PILLARS:
  1. ADAPTACIÓN ESTRICTA A LA REVISTA: The manuscript must be a "tailor-made suit" for ${journalRules.name}. Apply every rule from the provided "Guide for Authors".
  2. RIGOR CIENTÍFICO ABSOLUTO: Impeccable methodology, robust statistics, critical discussion. Identify and address weaknesses.
  3. NO HTML TAGS: Do NOT use any HTML tags like <br>, <b>, <table>, etc. in any text field. Use plain text with standard line breaks.
  
  SISTEMA DE GESTIÓN DE TABLAS E IMÁGENES:
  1. IDENTIFICACIÓN: Create a detailed "visualInventory" of all tables and figures found in the TFG.
  2. UBICACIÓN: Mark their recommended location in the text with placeholders like "[INSERT TABLE X]".
  3. FORMATEO: For tables, provide a clear text-based representation (not HTML) that follows the journal's style.
  
  SISTEMA AVANZADO DE ANÁLISIS ESTADÍSTICO CON TABLA RESUMEN PROFESIONAL:
  1. EXTRACCIÓN Y CLASIFICACIÓN: Identificar TODAS las pruebas estadísticas (paramétricas/no paramétricas), variables (dependientes/independientes), estadísticos (t, F, U, χ²), gl, valores p exactos, tamaños del efecto (Cohen's d, η², V de Cramer) e IC95%. Identificar software y versión.
  2. GENERACIÓN DE TABLA RESUMEN: Crear una tabla profesional (Objetivo | Variables | Prueba | Estadístico | IC95% | Valor p | Tamaño del efecto). Incluirla en el campo "tables" y referenciarla en "visualInventory" como "Tabla de Análisis Estadístico".
  3. VERIFICACIÓN Y CÁLCULO: Validar la coherencia prueba-variable. Si faltan tamaños del efecto, CALCULARLOS (t-test -> d=2t/√gl; ANOVA -> η²=F·gl_e/(F·gl_e+gl_d); Chi-sq -> V=√(χ²/(n·min(k-1,r-1)))).
  4. INTEGRACIÓN: Descripción narrativa profunda en Métodos y reporte riguroso en Resultados con estadísticos completos.
  
  ${journalRules.modelArticleText ? `
  ADVANCED ANALYSIS BASED ON MODEL ARTICLE:
  Analyze the provided model article to extract:
  - EXACT STRUCTURE: Sections and subsections.
  - TABLE FORMAT: Headers, bolding, statistical data (OR, CI95%, p-values).
  - FIGURE STYLE: Legends and titles.
  - WRITING STYLE: Voice, paragraph length, transitions.
  - REFERENCE STYLE: In-text and bibliography format.
  
  Model Article Text: ${journalRules.modelArticleText.substring(0, 15000)}
  ` : ""}
  
  CONTENT GUIDELINES:
  - EXTENSION: Aim for 3000-5000 words. EXPAND the TFG, do not just summarize it.
  - METADATA: Provide 3 title proposals. Include author normalization recommendations (IraLIS/FECYT).
  - INTRODUCTION: Use the "funnel" structure (Context -> State of the Art -> Gap -> Hypothesis/Objective).
  - METHODS: Surgical detail on Design, Population, Variables, Procedures, and Statistical Analysis. Use new lines (punto y aparte) for each subsection (e.g., STUDY POPULATION:\n[Text]\n\nDATA COLLECTION:\n[Text]).
  - RESULTS: Narrative flow with explicit table/figure references. Include ALL stats (p-values, CIs).
  - DISCUSSION: Deep interpretation (Findings -> Context -> Implications -> Limitations -> Strengths).
  - BIBLIOGRAPHY: Extract ALL references from the TFG (usually 15-20+). Use the EXACT format "1- [Reference text]" and put each on a NEW LINE. NO HTML.
  
  TFG Text: ${tfgText.substring(0, 28000)}...`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          titleProposals: { type: Type.ARRAY, items: { type: Type.STRING } },
          authorMetadata: { type: Type.STRING },
          abstract: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          atAGlance: { type: Type.STRING },
          introduction: { type: Type.STRING },
          methods: { type: Type.STRING },
          results: { type: Type.STRING },
          discussion: { type: Type.STRING },
          conclusions: { type: Type.STRING },
          acknowledgments: { type: Type.STRING },
          creditStatement: { type: Type.STRING },
          references: { type: Type.STRING },
          tables: { type: Type.STRING },
          visualInventory: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['table', 'figure'] },
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                recommendedLocation: { type: Type.STRING },
                formatRequired: { type: Type.STRING }
              },
              required: ['type', 'id', 'title', 'description', 'recommendedLocation', 'formatRequired']
            }
          },
          coverLetter: { type: Type.STRING },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "titleProposals", "authorMetadata", "abstract", "keywords", "atAGlance", "introduction", "methods", "results", "discussion", "conclusions", "references", "visualInventory", "coverLetter", "checklist", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}

export async function refineArticle(currentArticle: string, instructions: string, journalRules: JournalRules) {
  const model = "gemini-3-flash-preview";
  const prompt = `Refine the following scientific article based on these instructions: "${instructions}".
  
  CRITICAL RULES:
  1. ADAPTACIÓN ESTRICTA A LA REVISTA: Maintain strict adherence to the journal rules for "${journalRules.name}".
  2. RIGOR CIENTÍFICO Y ESTADÍSTICO: Ensure high academic standards. Apply the Advanced Statistical Analysis System (extract tests, calculate effect sizes if missing, generate summary tables, and ensure exact p-values).
  3. NO HTML TAGS: Do NOT use any HTML tags in any text field.
  4. VISUAL INVENTORY: Update the visual inventory if the instructions affect tables or figures.
  5. METHODS FORMAT: Use new lines for subsections (e.g., STUDY POPULATION:\n[Text]).
  6. BIBLIOGRAPHY: Extract ALL references. Use the format "1- [Reference text]" on new lines.
  
  Current Article: ${currentArticle.substring(0, 20000)}...`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          titleProposals: { type: Type.ARRAY, items: { type: Type.STRING } },
          authorMetadata: { type: Type.STRING },
          abstract: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          atAGlance: { type: Type.STRING },
          introduction: { type: Type.STRING },
          methods: { type: Type.STRING },
          results: { type: Type.STRING },
          discussion: { type: Type.STRING },
          conclusions: { type: Type.STRING },
          acknowledgments: { type: Type.STRING },
          creditStatement: { type: Type.STRING },
          references: { type: Type.STRING },
          tables: { type: Type.STRING },
          visualInventory: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['table', 'figure'] },
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                recommendedLocation: { type: Type.STRING },
                formatRequired: { type: Type.STRING }
              },
              required: ['type', 'id', 'title', 'description', 'recommendedLocation', 'formatRequired']
            }
          },
          coverLetter: { type: Type.STRING },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "titleProposals", "authorMetadata", "abstract", "keywords", "atAGlance", "introduction", "methods", "results", "discussion", "conclusions", "references", "visualInventory", "coverLetter", "checklist", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}
