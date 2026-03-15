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
  FileCheck
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { analyzeTFG, generateArticle, refineArticle, type TransformationResult, type JournalRules } from "./lib/gemini";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [tfgText, setTfgText] = useState<string>("");
  const [journalName, setJournalName] = useState<string>("");
  const [journalRulesText, setJournalRulesText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<TransformationResult | null>(null);
  const [refinementInstructions, setRefinementInstructions] = useState("");
  const [activeTab, setActiveTab] = useState<keyof TransformationResult>("abstract");

  const onDropTFG = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await fetch("/api/parse-file", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setTfgText(data.text);
    } catch (error) {
      console.error("Error uploading TFG:", error);
    }
  }, []);

  const onDropRules = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await fetch("/api/parse-file", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setJournalRulesText(data.text);
    } catch (error) {
      console.error("Error uploading Rules:", error);
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
    try {
      const res = await generateArticle(tfgText, { name: journalName, rulesText: journalRulesText });
      setResult(res);
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
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
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                <FileText size={16} />
                Step 1: Upload TFG
              </div>
              <div 
                {...getTFGProps()} 
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-center",
                  isTFGActive ? "border-emerald-500 bg-emerald-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white",
                  tfgText && "border-emerald-500/30 bg-emerald-50/20"
                )}
              >
                <input {...getTFGInputProps()} />
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", tfgText ? "bg-emerald-100 text-emerald-600" : "bg-neutral-100 text-neutral-400")}>
                  {tfgText ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                </div>
                <div>
                  <p className="font-medium">{tfgText ? "TFG Loaded Successfully" : "Drop your TFG here"}</p>
                  <p className="text-xs text-neutral-400 mt-1">PDF, DOCX, or TXT</p>
                </div>
              </div>
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
                    {journalRulesText ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                  </div>
                  <div>
                    <p className="font-medium">{journalRulesText ? "Rules Loaded Successfully" : "Upload Guide for Authors"}</p>
                    <p className="text-xs text-neutral-400 mt-1">PDF or TXT</p>
                  </div>
                </div>
              </div>
            </section>

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !tfgText || !journalName || !journalRulesText}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white font-semibold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 group"
            >
              {isGenerating ? <Loader2 className="animate-spin" /> : <Zap size={18} className="group-hover:scale-110 transition-transform" />}
              Generate High-Impact Draft
            </button>

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
