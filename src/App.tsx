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
  RotateCcw
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { analyzeTFG, generateArticle, refineArticle, type TransformationResult, type JournalRules } from "./lib/gemini";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";

// Set up PDF.js worker using local worker bundled by Vite
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [tfgText, setTfgText] = useState<string>("");
  const [journalName, setJournalName] = useState<string>("");
  const [journalRulesText, setJournalRulesText] = useState<string>("");
  const [tfgFileName, setTfgFileName] = useState<string>("");
  const [rulesFileName, setRulesFileName] = useState<string>("");
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

  const handleReset = () => {
    setTfgText("");
    setJournalName("");
    setJournalRulesText("");
    setTfgFileName("");
    setRulesFileName("");
    setResult(null);
    setRefinementInstructions("");
    setProgress(0);
    setElapsedTime(0);
    setActiveTab("abstract");
  };

  const onDropTFG = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    setTfgFileName(file.name);
    setTfgText(""); 
    setIsParsing(true);
    setError(null);
    
    try {
      let extractedText = "";

      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          fullText += pageText + "\n";
        }
        extractedText = fullText;
      } 
      else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } 
      else {
        extractedText = await file.text();
      }
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from this file. It might be empty or contain only images.");
      }

      setTfgText(extractedText);
    } catch (err: any) {
      console.error("Error reading file:", err);
      setError(`Error reading file: ${err.message}`);
      setTfgFileName(""); 
    } finally {
      setIsParsing(false);
    }
  }, []);

  const onDropRules = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setRulesFileName(file.name);
    setJournalRulesText(""); 
    setIsParsing(true);
    setError(null);
    
    try {
      let extractedText = "";

      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          fullText += pageText + "\n";
        }
        extractedText = fullText;
      } 
      else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } 
      else {
        extractedText = await file.text();
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from the rules file.");
      }

      setJournalRulesText(extractedText);
    } catch (err: any) {
      console.error("Error reading rules:", err);
      setError(`Error reading rules: ${err.message}`);
      setRulesFileName("");
    } finally {
      setIsParsing(false);
    }
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
      const res = await generateArticle(tfgText, { name: journalName, rulesText: journalRulesText });
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
      const res = await refineArticle(currentFullText, refinementInstructions, { name: journalName, rulesText: journalRulesText });
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

REFERENCES:
${result.references}

COVER LETTER:
${result.coverLetter}
    `;
    downloadFile(content, `Manuscript_${lang}_${journalName.replace(/\s+/g, '_')}.txt`);
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
                  Step 1: Upload TFG
                </div>
                <button 
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-xs text-emerald-600 hover:underline font-medium"
                >
                  {showManualInput ? "Use File Upload" : "Paste Text Manually"}
                </button>
              </div>

              {showManualInput ? (
                <div className="space-y-2">
                  <textarea
                    placeholder="Paste your TFG text here..."
                    className="w-full h-48 bg-white border border-neutral-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm"
                    value={tfgText}
                    onChange={(e) => {
                      setTfgText(e.target.value);
                      if (e.target.value) setTfgFileName("Manual Input");
                    }}
                  />
                  <p className="text-[10px] text-neutral-400 italic">
                    Tip: If the PDF reader fails, copy and paste the text from your document here.
                  </p>
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
                      {isParsing ? "Reading file..." : (tfgText && !showManualInput ? "TFG Loaded Successfully" : "Drop your TFG here")}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">PDF, DOCX, or TXT</p>
                    {tfgFileName && !showManualInput && (
                      <p className="text-xs font-mono text-emerald-600 mt-2 bg-emerald-50 px-2 py-1 rounded inline-block">
                        {tfgFileName}
                      </p>
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
                <div>
                  <p className="font-bold">Generation Error</p>
                  <p className="opacity-90">{error}</p>
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
                      </div>
                      <div className="flex gap-2">
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
                      {Object.keys(result).filter(k => !['title', 'diagnosis', 'checklist', 'keywords'].includes(k)).map((key) => (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key as any)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                            activeTab === key ? "bg-emerald-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
                          )}
                        >
                          {key}
                        </button>
                      ))}
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
                    </div>

                    {/* Content Area */}
                    <div className="min-h-[400px] prose prose-neutral max-w-none">
                      {activeTab === 'checklist' ? (
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
