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
    pageNumber?: string; // Page number in original TFG or "crear figura"
  }[];
  coverLetter: string;
  q1Validation: {
    criterion: string;
    status: 'pass' | 'fail' | 'warning';
    feedback: string;
  }[];
  checklist: string[];
  userMessages: string[]; // Advice for the user based on missing checklist items
  diagnosis: string;
}

const getQ1Modules = (journalName: string) => `
  MODULE: HIGH-IMPACT RESULTS (Q1 STANDARD):
  Results are the core of the evidence. They must be clear, precise, and non-redundant.
  1. NON-REDUNDANCY PRINCIPLE: The text must INTERPRET the data, not repeat the numbers already in tables or figures. Avoid unnecessary duplications.
  2. FORMAT SELECTION (APA 7 / Q1):
     - Plain text: For simple findings (1-2 data points).
     - Tables: For complex comparisons, demographics, and statistical models.
     - Figures/Graphs: For trends, distributions, and visual relationships.
  3. PROACTIVE CREATION AND STATISTICAL RIGOR: If the TFG lacks explicit tables or graphics but the data allows it, you MUST create new table/figure proposals. It is MANDATORY to include dispersion and precision statistics (95% CI, SD, Standard Error) when reporting main findings to elevate scientific quality.
  4. NARRATIVE FLOW: Organize results following the logic of the objectives. Each paragraph must invoke its corresponding table/figure (e.g., "As shown in Table 1...").

  MODULE: INTEGRITY AND FORMAL STANDARDS (Q1 STANDARD):
  The manuscript must demonstrate absolute transparency and adherence to international reporting and ethical standards.
  1. REPORTING GUIDELINES (EQUATOR NETWORK):
     It is mandatory to identify the study design and declare adherence to the specific guideline:
     - Clinical trials: CONSORT.
     - Observational studies (cross-sectional, cohort, case-control): STROBE.
     - Systematic reviews: PRISMA.
     - Other designs: Consult the Equator Network repository.
  2. ETHICAL TRANSPARENCY AND REGISTRATION:
     - Explicitly mention the approval from the Research Ethics Committee.
     - Confirm obtaining informed consent from all participants.
     - In experimental studies, include the mandatory registration (e.g., ClinicalTrials.gov or ISRCTN Register).
     - Conflict of Interest Statement: Collect and declare the status of all authors.
  3. SUPPORTING DOCUMENTATION AND REPRODUCIBILITY:
     - Mention the availability of relevant material: research protocol, database, results output, data collection notebook, or related publications.
     - Indicate in the Methods or Acknowledgments section how this documentation can be consulted to guarantee the transparency of the process.

  MODULE: INTERPRETATIVE DISCUSSION (Q1 STANDARD):
  The Discussion is the culmination of the research process in its interpretative phase. Its purpose is to interpret the findings based on previous knowledge and determine if said knowledge is modified.
  1. MANDATORY STRUCTURED SEQUENCE:
     a) Recapitulation: Main findings that constitute the answer to the main question (without repeating result numbers).
     b) Internal Validity and Limitations: Honest balance of strengths and weaknesses.
     c) Comparison: Contrast results with other works of similar design and methodology.
     d) External Validity: Degree of generalization or extrapolation to other contexts.
     e) Recommendations and future lines of research.
     f) Conclusions: Direct answer to the objectives set in the Introduction.
  2. GOLDEN RULES:
     - DO NOT repeat the results.
     - Honest, non-speculative interpretation.
     - Avoid unfocused or excessively long literature reviews.
     - Avoid excessive speculation on secondary findings.

  MODULE: TOTAL REPRODUCIBILITY METHODS (Q1 STANDARD):
  Also called "Material and Methods", its function is to present the methodology with surgical detail to guarantee the principle of reproducibility. It is the section most evaluated by reviewers.
  1. LOGICAL AND ORDERED STRUCTURE:
     - Design: Type of study.
     - Setting and study period: Where and when.
     - Study population: Definition, inclusion and exclusion criteria.
     - Sample: Sample size calculation and subject selection.
     - Procedures: Information sources and interventions (if applicable).
     - Instruments: Measurement tools used.
     - Variables: Clear definition of dependent and independent variables.
     - Ethical Aspects: Approvals and regulatory compliance.
     - Statistical Plan: Exhaustive detail of the analysis.
  2. GOLDEN RULE: If the study is based on a previously published protocol, the "protocol article" must be cited and the method presented briefly.

  MODULE: STRATEGIC INTRODUCTION (Q1 STANDARD):
  The introduction is the cover letter of the article to editors, reviewers, and readers. Its purpose is to contextualize and justify the study.
  1. MANDATORY STRUCTURE:
     a) Definition and background: Clear background of the problem studied.
     b) Theoretical framework: If any, integrate it coherently.
     c) Key variables: Precise definition of the study variables.
     d) Justification, importance, and scope: Explain why it is relevant and what its impact is.
     e) Objectives and Hypotheses: Explicit statement at the end (mandatory hypothesis in analytical designs).
  2. STYLE AND RIGOR:
     - Brevity and precision: Similar to the background of a protocol but more concise.
     - Current evidence: Prioritize the use of recent systematic reviews.
     - Strategic citations: References should be just enough and directly linked to objectives and hypotheses.

  MODULE: HIGH-IMPACT CONCLUSIONS (Q1 STANDARD):
  Conclusions synthesize the results based on the objectives set.
  1. GOLDEN RULE (ALIGNMENT): Conclusions are built with the results obtained, but ALWAYS aligned with the study objectives.
  2. MANDATORY STRUCTURE AND ORDER (a, b, c) - USE EXPLICIT LABELS:
     a) General Conclusion: Point out the general conclusion aligned with the fulfillment of the general objective, including the main result.
     b) Main Results: Point out the findings related to the specific objectives.
     c) Contributions, Benefits, and Future: Highlight contributions and benefits of the results (both general and specific). Include 1-2 recommendations for future work. Mention limitations (what could not be proven) to guide other researchers.
  3. CRITICAL RESTRICTIONS:
     - Forbidden to incorporate elements not treated in the research.
     - Do not use the theoretical framework to reinforce results.
     - Do not express personal importance or value judgments about the results.

  MODULE: EDITORIAL EXTENSION AND DEPTH (ELSEVIER/Q1 STANDARD):
  To reach the standard of the best Elsevier journals, the article must have superior density and academic depth.
  1. EXTENSION OBJECTIVE:
     - Abstract: 1 dense and structured paragraph.
     - Introduction: 1.5 to 2 pages (approx. 800-1000 words). It must be a perfect funnel of evidence.
     - Methodology: 2 to 4 pages (approx. 1000-1500 words). Surgical detail.
     - Results and Discussion: 10 to 12 pages (approx. 4000-5000 words). It is the heart of the article.
     - Conclusions: 1 to 2 pages (approx. 500-800 words).
  2. EVIDENCE DENSITY:
     - Graphics: Aim for 6-8 high-impact visual elements.
     - Tables: Between 1 and 3 complex and professional tables.
     - References: Between 20 and 50 high-impact references (Scopus/WoS), prioritizing the last 5 years.
  3. GOLDEN RULE: It's not about "filling", but about expanding the analysis, deepening the explanatory mechanisms in the discussion, and detailing each step of the process in methods.

  MODULE: PERSUASIVE COVER LETTER (Q1 STANDARD):
  The cover letter is a strategic tool to persuade the editor about the scope and importance of the contribution. It should not be a standard template or repeat the abstract.
  1. TONE AND STYLE:
     - Somewhat more informal tone than scientific writing (direct communication with the editor).
     - Concise content: 2-3 paragraphs maximum.
     - Total individualization: Adapt the message specifically to the journal "${journalName}".
  2. STRUCTURE AND CONTENT:
     - Formal Data: Include title, authors, article length, number of tables and figures.
     - Ethical Statement: Formal statement that it is an unpublished contribution and has not been sent to another journal.
     - Defense of Strengths: Highlight the originality of the work and what it brings new to the discipline.
     - Suitability of the Journal: Explain why "${journalName}" is the ideal place. It is highly recommended to refer to similar articles recently published in this same journal to demonstrate alignment with its editorial line.
  3. OBJECTIVE: Make a difference so the editor decides to send the work for review instead of rejecting it initially.
  
  MODULE: INTELLIGENT VISUAL INVENTORY AND RESULTS (Q1 STANDARD):
  Phase 4.1: Visual Presentation Engineering and Results Development.
  The Results section is crucial and must be developed exhaustively without redundancies. You must act as a graphic and scientific editor following the APA 7 style.
  
  Strictly follow these guidelines:
  1. DIAGNOSIS AND SYNTHETIC CREATION:
     - If the TFG contains scattered information, you must design the optimal presentation strategy.
     - CRITICAL: If the TFG does NOT have explicit tables or graphics, you MUST CREATE THEM. Synthesize key data from the text into a "Main Findings Table" or a "Trend Graph" (text representation) and include them in the Tables tab. Do not leave the article without visual support.
  2. NON-REDUNDANCY PRINCIPLE AND APA 7:
     - Avoid duplicities: Do not repeat in the text what is already in the tables/figures. The text must INTERPRET, not visualize.
     - APA 7 Style: Impeccable organization of statistical information. Avoid excessive or oversized use of elements; each must be essential.
  3. RESULTS SECTION DEVELOPMENT:
     - It should not be sparse. It must be a rigorous and detailed development of the findings linked to the objectives.
     - Use TEXT to narrate logic and highlight milestones.
     - Use TABLES for exact data and multiple comparisons (Self-sufficient information island).
     - Use GRAPHS to reveal high-impact visual trends and comparisons.
  4. CONSTRUCTION OF SELF-SUFFICIENT ELEMENTS:
     - Each element must be understood without reading the text. Descriptive titles (full sentences) in the figure caption or table header.
  5. NARRATIVE FLOW:
     - Invoke tables and figures in numerical order. The text guides the reader through the visual evidence without repeating raw data.
`;

export async function analyzeTFG(tfgText: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze the following undergraduate thesis (TFG) and extract its core components: 
  objective, methodology, key results, and main conclusions. 
  
  IMPORTANT: The analysis and all fields in the JSON response MUST be written in ENGLISH.
  
  STATISTICAL DIAGNOSIS SYSTEM:
  Identify the statistical tests used and evaluate their appropriateness. 
  Check if p-values are exact, if effect sizes are reported, and if assumptions (normality, etc.) are mentioned.
  Specifically, look for the "STATISTICAL ANALYSIS" section and evaluate if it provides enough detail for a high-impact journal.
  
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
  1. STRICT ADAPTATION TO THE JOURNAL: The manuscript must be a "tailor-made suit" for ${journalRules.name}. Apply every rule from the provided "Guide for Authors".
  2. ABSOLUTE SCIENTIFIC RIGOR: Impeccable methodology, robust statistics, critical discussion. Identify and address weaknesses.
  3. NO HTML TAGS: Do NOT use any HTML tags like <br>, <b>, <table>, etc. in any text field. Use plain text with standard line breaks.
  4. LANGUAGE: The entire manuscript and all fields in the JSON response MUST be written in ENGLISH. This is an absolute requirement.
  
  ${getQ1Modules(journalRules.name)}
  
  TABLE AND IMAGE MANAGEMENT SYSTEM:
  1. IDENTIFICATION: Create a detailed "visualInventory" of all tables and figures found in the TFG.
  2. LOCATION: Mark their recommended location in the text with placeholders like "[INSERT TABLE X]".
  3. FORMATTING AND FULL DATA (CRITICAL): The "tables" field MUST contain the full text representation (using pipes | for columns and rows) of ALL identified tables (Table 1, Table 2, Table 3, etc.) PLUS the "STATISTICAL SUMMARY TABLE". Do not limit yourself to the description; the user needs the formatted raw data so they can copy it directly. Each table must be clearly separated by its title.
  4. PAGE NUMBERS: For each figure, identify the page number where it appears in the original TFG. If it's a new figure that needs to be created, set the page number to "crear figura".
  
  ADVANCED STATISTICAL ANALYSIS SYSTEM WITH PROFESSIONAL SUMMARY TABLE:
  1. EXTRACTION AND CLASSIFICATION: Identify ALL statistical tests (parametric/non-parametric), variables (dependent/independent), statistics (t, F, U, χ²), df, exact p-values, effect sizes (Cohen's d, η², Cramer's V), and 95% CI. Identify software and version.
  2. INTEGRATION IN METHODS AND TABLES: The "STATISTICAL ANALYSIS" section within "METHODS" must be extensive and detailed. At the end of this section, you MUST include a summary table in text format (using pipes | for columns and rows). ALSO, include this same "STATISTICAL SUMMARY TABLE" at the beginning of the "tables" field so it is visible in the tables section, followed by the data of all other tables in the inventory.
  3. VERIFICATION AND CALCULATION: Validate the test-variable consistency. If effect sizes are missing, CALCULATE them (t-test -> d=2t/√df; ANOVA -> η²=F·df_e/(F·df_e+df_d); Chi-sq -> V=√(χ²/(n·min(k-1,r-1)))).
  4. REPORTING IN RESULTS: Rigorous reporting in Results with complete statistics.
  
  CRITICAL IMPROVEMENTS FOR HIGH IMPACT (Q1 Level):
  1. RELEVANCE AND NARRATIVE (STORYTELLING):
     - Explicitly identify the "GAP" (knowledge gap) and the "HOOK" (hook) in the Abstract and Introduction.
     - Transform the Research Question into the central axis of the Abstract.
     - SEO/Academic Titles: Generate short, descriptive proposals with high-impact keywords (Scopus/WoS).
  2. RIGOR AND TRANSPARENCY (TRUST FACTOR):
     - Data Availability Statement: Include in "acknowledgments" or at the end of "methods" how to access the data.
     - Study Limitations: Do not hide flaws; discuss them honestly in a subsection of the Discussion.
     - INCLUSION/EXCLUSION Criteria: Mandatory in the Methods section to guarantee reproducibility.
  3. ADVANCED VISUAL IMPACT (Q1):
     - Apply the Intelligent Visual Inventory Module: Format diagnosis, non-redundancy, and self-sufficient elements.
     - Table 1 (Baseline): The first table must always be the sample's baseline/demographic characteristics.
     - Legends: Must be descriptive and complete, allowing independent understanding of the element.
  4. LANGUAGE, STYLE, AND READABILITY (CRITICAL - PARAGRAPH BREAKS):
     - MANDATORY PARAGRAPH BREAKS: It is an absolute requirement to use paragraph breaks frequently. DO NOT generate dense or stuck blocks of text. Each main idea or logical section MUST have its own paragraph separated by a double line break (\n\n). This is vital for readability both in the interface and in the final Word document. If a section has more than 150 words, it must be divided into at least 2 or 3 paragraphs.
     - Preference for Active Voice: Change "It was found" to "We found" or "The results reveal".
     - Technical Vocabulary: Use formal terminology (e.g., "examine" instead of "look at").
     - Consistency: Maintain the same term for a concept throughout the article (e.g., do not mix "subjects" and "participants").
  5. EDITORIAL AND ETHICAL VALIDATION:
     - CRediT Contributions: Generate the detailed paragraph in "creditStatement".
     - Conflict of Interest: Include standard statement in "acknowledgments".
     - Length: Adjust to 3000-5000 words, expanding the TFG content with academic depth.
     - Cover Letter Q1: Apply the Persuasive Cover Letter module to defend the importance of the study before the editor.
  
  VALIDATION PROTOCOL FOR Q1 JOURNALS (REVIEWER CHECKLIST):
  You are an expert assistant in high-impact publications. Before finalizing the article, you must act as a SEVERE BUT CONSTRUCTIVE REVIEWER. Review the draft of the article and apply the following quality filters iteratively. If you find that any point is not met, you must rewrite or suggest to the user (using comments in brackets [ ]) the necessary changes to reach the Q1 standard.

  1. TITLE ANALYSIS (Precision vs. Ambiguity): Evaluate if the title accurately reflects the scope or is too generic. If it is vague, rewrite it to include scope, population, or main variable.
  2. ABSTRACT SCAN (Conciseness and Hook): It must contain Purpose, Methodology, Relevant Results (concrete data), and Conclusion. Focus on novelty.
  3. CONNECTION WITH THE STATE OF THE ART: The introduction must demonstrate knowledge and end with an explicit statement of the "GAP". Prioritize references from the last 3-5 years.
  4. EXPLICIT STATEMENT OF OBJECTIVES: They must be clear at the end of the introduction: "To address this question, this study aims to...".
  5. METHODOLOGICAL JUSTIFICATION: Link methods to objectives. Explain why the method is appropriate.
  6. ORIGINALITY FILTER (Anti-Provincialism): If the study is local, add a paragraph on "Broader Implications" or "Generalizability" for an international audience.
  7. TEXT SURGERY: Eliminate redundancies, empty content, and excessive rhetoric. Structure: Claim -> Evidence -> Explanation.
  8. IMPACTFUL CONCLUSIONS: Direct answer to objectives. Synthesis of findings. Relevance in context. Limitation and future line.

  INSTRUCTION FOR q1Validation:
  You must complete the "q1Validation" array evaluating EACH of the 8 points of the VALIDATION PROTOCOL mentioned above. 
  - criterion: The name of the criterion (e.g., "Title Analysis", "Abstract Scan", etc.)
  - status: "pass" if it is perfectly met, "warning" if it can be improved, "fail" if it is missing or deficient.
  - feedback: A brief explanation of why it has that status and what has been done or needs to be done.

  6. SELF-EVALUATION AND ADVICE (HIGH-IMPACT CHECKLIST):
     Evaluate the manuscript against this checklist. If any point is NOT met or information is missing in the TFG, generate advice in "userMessages".
     
     LEVEL 1: CRITICAL
     - Title and Focus: Is it specific and reflects the main finding?
     - Novelty: Does it explicitly state the original contribution?
     - Methodological Rigor: Is the design appropriate for the question?
     - Statistics: Does it report exact p, 95% CI, and Effect Size? Multivariate analysis?
     - Results: Is the presentation professional and clear?
     
     LEVEL 2: SCIENTIFIC QUALITY
     - Discussion: Quantitative comparison with literature? Explanatory mechanisms?
     - Conclusions: Strictly based on results? Without over-extrapolation?
     - References: Strict Vancouver format? Updated?
     
     LEVEL 3: INTEGRITY AND FORMAT
     - Declarations: Includes Ethics, Conflicts, Funding, and CRediT?
     - Editorial Quality: Professional language and error-free?
     - Cover Letter: Argues why the study is suitable for the journal?
     - Integrity: No plagiarism or inconsistent data?
     
                         
                           
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
  - EXTENSION: Aim for 8000-10000 words total to match Elsevier's 25-30 page standard. EXPAND the TFG significantly, adding depth, context, and detailed analysis.
  - METADATA: Provide 3 title proposals. Include author normalization recommendations (IraLIS/FECYT).
  - INTRODUCTION: Apply the Strategic Introduction Module. Funnel structure (Context -> State of the Art -> GAP -> Justification -> Objectives/Hypotheses). Goal: 800-1000 words.
  - METHODS: Apply the Total Reproducibility Methods Module and the Integrity and Formal Standards Module. Declare adherence to STROBE/CONSORT according to design. Goal: 1000-1500 words.
  - RESULTS: Apply the High-Impact Results Module. Fluid narrative, no redundancy with tables/figures. Explicit references to [INSERT TABLE/FIGURE X]. If visuals are missing in the TFG, create proposals based on the data. Goal: 2000-2500 words.
  - DISCUSSION: Apply the Interpretative Discussion Module. Focus on interpretation, comparison, and validity. Goal: 2000-2500 words.
  - CONCLUSIONS: Apply the High-Impact Conclusions Module. Ensure alignment with objectives and inclusion of contributions/future lines. Goal: 500-800 words.
  - BIBLIOGRAPHY: Extract ALL references from the TFG (usually 20-50+). Use the EXACT format "1- [Reference text]" and put each on a NEW LINE. CRITICAL: Each reference must be a single continuous string without internal line breaks or carriage returns. NO HTML.
  
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
                formatRequired: { type: Type.STRING },
                pageNumber: { type: Type.STRING, description: 'Page number in original TFG or "crear figura"' }
              },
              required: ['type', 'id', 'title', 'description', 'recommendedLocation', 'formatRequired', 'pageNumber']
            }
          },
          coverLetter: { type: Type.STRING },
          q1Validation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['pass', 'fail', 'warning'] },
                feedback: { type: Type.STRING }
              },
              required: ['criterion', 'status', 'feedback']
            }
          },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          userMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "titleProposals", "authorMetadata", "abstract", "keywords", "atAGlance", "introduction", "methods", "results", "discussion", "conclusions", "references", "visualInventory", "coverLetter", "q1Validation", "checklist", "userMessages", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}

export async function refineArticle(currentArticle: string, instructions: string, journalRules: JournalRules) {
  const model = "gemini-3-flash-preview";
  const prompt = `Refine the following scientific article based on these instructions: "${instructions}".
  
  CRITICAL RULES:
  1. STRICT ADAPTATION TO THE JOURNAL: Maintain strict adherence to the journal rules for "${journalRules.name}".
  2. SCIENTIFIC AND STATISTICAL RIGOR (Q1 LEVEL): Ensure high academic standards. Apply the Q1 High-Impact Pillars (Narrative/GAP, Transparency, Visual Impact, Active Voice, CRediT). Ensure the "STATISTICAL SUMMARY TABLE" is present in both Methods and the Tables section.
  3. TABLE MANAGEMENT (CRITICAL): The "tables" field MUST contain the full text representation (pipes |) of ALL identified tables (Table 1, Table 2, etc.) PLUS the "STATISTICAL SUMMARY TABLE". Do not limit yourself to the description; the user needs the formatted raw data.
  4. READABILITY (MANDATORY PARAGRAPH BREAKS): It is an absolute requirement to use paragraph breaks frequently. DO NOT generate dense blocks of text. Each main idea or logical section MUST have its own paragraph separated by a double line break (\n\n). If a section has more than 150 words, it must be divided into at least 2 or 3 paragraphs.
  5. Q1 JOURNAL VALIDATION PROTOCOL (REVIEWER CHECKLIST): Act as a SEVERE REVIEWER. Evaluate Title (precision), Abstract (hook/data), GAP (knowledge gap), Objectives (explicit), Methodological Justification, Originality (anti-provincialism), Text Surgery (conciseness), and Impactful Conclusions. You must populate the "q1Validation" field with this detailed evaluation (criterion, status, feedback).
  6. SELF-EVALUATION AND ADVICE (HIGH-IMPACT CHECKLIST): Evaluate the manuscript against the checklist. If elements are missing or the TFG does not provide them, generate advice in "userMessages".
  7. NO HTML TAGS: Do NOT use any HTML tags in any text field.
  8. LANGUAGE: The entire manuscript and all fields in the JSON response MUST be written in ENGLISH.
  
  ${getQ1Modules(journalRules.name)}
  
  CONTENT GUIDELINES:
  - EXTENSION: Aim for 8000-10000 words total. EXPAND the content significantly to reach Elsevier's 25-30 page standard.
  - INTRODUCTION: Apply the Strategic Introduction Module. Goal: 800-1000 words.
  - METHODS: Apply the Total Reproducibility Methods Module and the Integrity and Formal Standards Module. Goal: 1000-1500 words.
  - RESULTS: Apply the High-Impact Results Module. Goal: 2000-2500 words.
  - DISCUSSION: Apply the Interpretative Discussion Module. Goal: 2000-2500 words.
  - CONCLUSIONS: Apply the High-Impact Conclusions Module. Goal: 500-800 words.
  - COVER LETTER: Apply the Persuasive Cover Letter Module.
  - VISUALS: Apply the Intelligent Visual Inventory Module. Aim for 6-8 graphics and 1-3 tables.
  
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
                formatRequired: { type: Type.STRING },
                pageNumber: { type: Type.STRING, description: 'Page number in original TFG or "crear figura"' }
              },
              required: ['type', 'id', 'title', 'description', 'recommendedLocation', 'formatRequired', 'pageNumber']
            }
          },
          coverLetter: { type: Type.STRING },
          q1Validation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['pass', 'fail', 'warning'] },
                feedback: { type: Type.STRING }
              },
              required: ['criterion', 'status', 'feedback']
            }
          },
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          userMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
          diagnosis: { type: Type.STRING },
        },
        required: ["title", "titleProposals", "authorMetadata", "abstract", "keywords", "atAGlance", "introduction", "methods", "results", "discussion", "conclusions", "references", "visualInventory", "coverLetter", "q1Validation", "checklist", "userMessages", "diagnosis"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as TransformationResult;
}
