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
}

export interface TransformationResult {
  title: string;
  abstract: string;
  keywords: string[];
  introduction: string;
  methods: string;
  results: string;
  discussion: string;
  conclusions: string;
  references: string;
  coverLetter: string;
  checklist: string[];
  diagnosis: string;
}

export async function analyzeTFG(tfgText: string) {
  const model = "gemini-3.1-pro-preview";
  const prompt = `Analyze the following undergraduate thesis (TFG) and extract its core components: 
  objective, methodology, key results, and main conclusions. 
  Also, provide a "rigor diagnosis" identifying weaknesses for a high-impact journal.
  
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
  const model = "gemini-3.1-pro-preview";
  const prompt = `You are an expert scientific editor. Transform the following TFG into a high-impact journal article for the journal "${journalRules.name}".
  
  STRICTLY FOLLOW THESE RULES:
  1. ADAPTATION: Use the provided journal rules: ${journalRules.rulesText.substring(0, 10000)}
  2. RIGOR: Ensure high scientific rigor (reproducible methods, robust stats, critical discussion).
  3. STRUCTURE: Use IMRyD+ (Introduction, Methods, Results, Discussion, Conclusions).
  4. METADATA: Generate title, abstract, keywords, and cover letter.
  5. LANGUAGE: Provide the output in English.
  
  TFG Text: ${tfgText.substring(0, 20000)}...`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          abstract: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          introduction: { type: Type.STRING },
          methods: { type: Type.STRING },
          results: { type: Type.STRING },
          discussion: { type: Type.STRING },
          conclusions: { type: Type.STRING },
          references: { type: Type.STRING },
          coverLetter: { type: Type.STRING },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "abstract", "keywords", "introduction", "methods", "results", "discussion", "conclusions", "references", "coverLetter", "checklist", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}

export async function refineArticle(currentArticle: string, instructions: string, journalRules: JournalRules) {
  const model = "gemini-3.1-pro-preview";
  const prompt = `Refine the following scientific article based on these instructions: "${instructions}".
  Maintain strict adherence to the journal rules for "${journalRules.name}": ${journalRules.rulesText.substring(0, 5000)}.
  
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
          abstract: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          introduction: { type: Type.STRING },
          methods: { type: Type.STRING },
          results: { type: Type.STRING },
          discussion: { type: Type.STRING },
          conclusions: { type: Type.STRING },
          references: { type: Type.STRING },
          coverLetter: { type: Type.STRING },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "abstract", "keywords", "introduction", "methods", "results", "discussion", "conclusions", "references", "coverLetter", "checklist", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}
