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
  MÓDULO: RESULTADOS DE ALTO IMPACTO (ESTÁNDAR Q1):
  Los resultados son el núcleo de la evidencia. Deben ser claros, precisos y no redundantes.
  1. PRINCIPIO DE NO-REDUNDANCIA: El texto debe INTERPRETAR los datos, no repetir los números que ya están en las tablas o figuras. Evitar duplicidades innecesarias.
  2. SELECCIÓN DE FORMATO (APA 7 / Q1):
     - Texto plano: Para hallazgos simples (1-2 datos).
     - Tablas: Para comparaciones complejas, demografía y modelos estadísticos.
     - Figuras/Gráficos: Para tendencias, distribuciones y relaciones visuales.
  3. CREACIÓN PROACTIVA: Si el TFG carece de tablas o gráficos pero los datos lo permiten, DEBES crear propuestas de tablas/figuras nuevas (indicando "crear tabla/figura" en el inventario) para elevar la calidad del artículo.
  4. FLUJO NARRATIVO: Organizar los resultados siguiendo la lógica de los objetivos. Cada párrafo debe invocar a su tabla/figura correspondiente (Ej: "Como se muestra en la Tabla 1...").

  MÓDULO: INTEGRIDAD Y ESTÁNDARES FORMALES (ESTÁNDAR Q1):
  El manuscrito debe demostrar transparencia absoluta y adherencia a estándares internacionales de reporte y ética.
  1. DIRECTRICES DE REPORTE (EQUATOR NETWORK):
     Es obligatorio identificar el diseño del estudio y declarar la adherencia a la directriz específica:
     - Ensayos clínicos: CONSORT.
     - Estudios observacionales (transversales, cohortes, casos y controles): STROBE.
     - Revisiones sistemáticas: PRISMA.
     - Otros diseños: Consultar el repositorio de Equator Network.
  2. TRANSPARENCIA ÉTICA Y REGISTRO:
     - Mencionar explícitamente el visto bueno del Comité de Ética de Investigación.
     - Confirmar la obtención de consentimientos informados de todos los participantes.
     - En estudios experimentales, incluir el registro obligatorio (ej. ClinicalTrials.gov o ISRCTN Register).
     - Declaración de conflicto de intereses: Recopilar y declarar la situación de todos los autores.
  3. DOCUMENTACIÓN DE APOYO Y REPRODUCIBILIDAD:
     - Mencionar la disponibilidad de material relevante: protocolo de investigación, base de datos, salida de resultados, cuaderno de recogida de datos o publicaciones relacionadas.
     - Indicar en la sección de Métodos o Agradecimientos cómo se puede consultar esta documentación para garantizar la transparencia del proceso.

  MÓDULO: DISCUSIÓN INTERPRETATIVA (ESTÁNDAR Q1):
  La Discusión es el culmen del proceso de investigación en su fase interpretativa. Su finalidad es interpretar los hallazgos en función del conocimiento previo y determinar si se modifica dicho conocimiento.
  1. SECUENCIA ESTRUCTURADA OBLIGATORIA:
     a) Recapitulación: Hallazgos principales que constituyen la respuesta a la pregunta principal (sin repetir números de resultados).
     b) Validez Interna y Limitaciones: Balance honesto de puntos fuertes y débiles.
     c) Comparación: Contrastar resultados con otros trabajos de diseño y metodología similares.
     d) Validez Externa: Grado de generalización o extrapolación a otros contextos.
     e) Recomendaciones y líneas futuras de investigación.
     f) Conclusiones: Respuesta directa a los objetivos planteados en la Introducción.
  2. REGLAS DE ORO:
     - NO repetir los resultados.
     - Interpretación honesta, no especulativa.
     - Evitar revisiones de literatura desenfocadas o excesivamente largas.
     - Evitar especulación excesiva sobre hallazgos secundarios.

  MÓDULO: MÉTODOS DE REPRODUCIBILIDAD TOTAL (ESTÁNDAR Q1):
  También denominado "Material y método", su función es presentar la metodología con detalle quirúrgico para garantizar el principio de reproducibilidad. Es el apartado más evaluado por los revisores.
  1. ESTRUCTURA LÓGICA Y ORDENADA:
     - Diseño: Tipo de estudio.
     - Ámbito y periodo de estudio: Dónde y cuándo.
     - Población de estudio: Definición, criterios de inclusión y exclusión.
     - Muestra: Cálculo del tamaño muestral y selección de sujetos.
     - Procedimientos: Fuentes de información e intervenciones (si aplica).
     - Instrumentos: Herramientas de medición utilizadas.
     - Variables: Definición clara de dependientes e independientes.
     - Aspectos Éticos: Aprobaciones y cumplimiento normativo.
     - Plan Estadístico: Detalle exhaustivo del análisis.
  2. REGLA DE ORO: Si el estudio se basa en un protocolo publicado previamente, debe citarse el "artículo de protocolo" y presentar el método de forma breve.

  MÓDULO: INTRODUCCIÓN ESTRATÉGICA (ESTÁNDAR Q1):
  La introducción es la carta de presentación del artículo ante editores, revisores y lectores. Su objeto es contextualizar y justificar el estudio.
  1. ESTRUCTURA OBLIGATORIA:
     a) Definición y antecedentes: Antecedentes claros del problema estudiado.
     b) Marco teórico: Si lo hubiese, integrarlo de forma coherente.
     c) Variables clave: Definición precisa de las variables de estudio.
     d) Justificación, importancia y alcance: Explicar por qué es relevante y cuál es su impacto.
     e) Objetivos e Hipótesis: Declaración explícita al final (hipótesis obligatoria en diseños analíticos).
  2. ESTILO Y RIGOR:
     - Brevedad y precisión: Similar a los antecedentes de un protocolo pero más conciso.
     - Evidencia actual: Priorizar el uso de revisiones sistemáticas recientes.
     - Citas estratégicas: Las referencias deben ser las justas y estar vinculadas directamente a los objetivos e hipótesis.

  MÓDULO: CONCLUSIONES DE ALTO IMPACTO (ESTÁNDAR Q1):
  Las conclusiones sintetizan los resultados en función de los objetivos trazados.
  1. REGLA DE ORO (ALINEACIÓN): Las conclusiones se construyen con los resultados obtenidos, pero SIEMPRE alineados a los objetivos del estudio.
  2. ESTRUCTURA OBLIGATORIA Y ORDEN (a, b, c):
     a) Conclusión General: Señalar la conclusión general alineada al cumplimiento del objetivo general, incluyendo el resultado principal.
     b) Resultados Principales: Señalar los hallazgos relacionados con los objetivos específicos.
     c) Aportes, Beneficios y Futuro: Resaltar aportes y beneficios de los resultados (tanto generales como específicos). Incluir 1-2 recomendaciones de trabajo futuro. Mencionar limitaciones (aquello que no se haya podido demostrar) para guiar a otros investigadores.
  3. RESTRICCIONES CRÍTICAS:
     - Prohibido incorporar elementos no tratados en la investigación.
     - No utilizar el marco teórico para reforzar los resultados.
     - No exponer la importancia personal o juicios de valor sobre los resultados.

  MÓDULO: COVER LETTER PERSUASIVA (ESTÁNDAR Q1):
  La carta de presentación (cover letter) es una herramienta estratégica para persuadir al editor sobre el alcance e importancia de la contribución. No debe ser una plantilla estándar ni repetir el resumen.
  1. TONO Y ESTILO:
     - Tono algo más informal que la redacción científica (comunicación directa con el editor).
     - Contenido conciso: 2-3 párrafos máximo.
     - Individualización total: Adecuar el mensaje específicamente a la revista "${journalName}".
  2. ESTRUCTURA Y CONTENIDO:
     - Datos Formales: Incluir título, autores, extensión del artículo, número de tablas y figuras.
     - Declaración Ética: Declaración formal de que es una aportación inédita y no ha sido enviada a otra revista.
     - Defensa de Fortalezas: Subrayar la originalidad del trabajo y qué aporta de nuevo a la disciplina.
     - Idoneidad de la Revista: Explicar por qué "${journalName}" es el lugar ideal. Es muy recomendable hacer referencia a artículos similares publicados recientemente en esta misma revista para demostrar alineación con su línea editorial.
  3. OBJETIVO: Marcar la diferencia para que el editor decida enviar el trabajo a revisión en lugar de rechazarlo inicialmente.
  
  MÓDULO: INVENTARIO VISUAL INTELIGENTE Y RESULTADOS (ESTÁNDAR Q1):
  Fase 4.1: Ingeniería de la Presentación Visual y Desarrollo de Resultados.
  El apartado de Resultados es crucial y debe ser desarrollado exhaustivamente sin redundancias. Debes actuar como un editor gráfico y científico siguiendo el estilo APA 7.
  
  Sigue estrictamente estas directrices:
  1. DIAGNÓSTICO Y CREACIÓN SINTÉTICA:
     - Si el TFG contiene información dispersa, debes diseñar la estrategia de presentación óptima.
     - CRÍTICO: Si el TFG NO tiene tablas o gráficos explícitos, DEBES CREARLOS. Sintetiza los datos clave del texto en una "Tabla de Hallazgos Principales" o un "Gráfico de Tendencias" (representación en texto) e inclúyelos en la pestaña de Tablas. No dejes el artículo sin apoyo visual.
  2. PRINCIPIO DE NO REDUNDANCIA Y APA 7:
     - Evita duplicidades: No repitas en el texto lo que ya está en las tablas/figuras. El texto debe INTERPRETAR, no visualizar.
     - Estilo APA 7: Organización impecable de la información estadística. Evita el uso excesivo o sobredimensionado de elementos; cada uno debe ser esencial.
  3. DESARROLLO DE LA SECCIÓN RESULTADOS:
     - No debe ser escaso. Debe ser un desarrollo riguroso y detallado de los hallazgos vinculados a los objetivos.
     - Usa TEXTO para narrar la lógica y destacar hitos.
     - Usa TABLAS para datos exactos y comparaciones múltiples (Isla de información autosuficiente).
     - Usa GRÁFICOS para revelar tendencias y comparaciones visuales de alto impacto.
  4. CONSTRUCCIÓN DE ELEMENTOS AUTOSUFICIENTES:
     - Cada elemento debe entenderse sin leer el texto. Títulos descriptivos (frases completas) en el pie de figura o cabecera de tabla.
  5. FLUJO NARRATIVO:
     - Invoca tablas y figuras en orden numérico. El texto guía al lector a través de la evidencia visual sin repetir los datos brutos.
`;

export async function analyzeTFG(tfgText: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze the following undergraduate thesis (TFG) and extract its core components: 
  objective, methodology, key results, and main conclusions. 
  
  SISTEMA DE DIAGNÓSTICO ESTADÍSTICO:
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
  1. ADAPTACIÓN ESTRICTA A LA REVISTA: The manuscript must be a "tailor-made suit" for ${journalRules.name}. Apply every rule from the provided "Guide for Authors".
  2. RIGOR CIENTÍFICO ABSOLUTO: Impeccable methodology, robust statistics, critical discussion. Identify and address weaknesses.
  3. NO HTML TAGS: Do NOT use any HTML tags like <br>, <b>, <table>, etc. in any text field. Use plain text with standard line breaks.
  
  ${getQ1Modules(journalRules.name)}
  
  SISTEMA DE GESTIÓN DE TABLAS E IMÁGENES:
  1. IDENTIFICACIÓN: Create a detailed "visualInventory" of all tables and figures found in the TFG.
  2. UBICACIÓN: Mark their recommended location in the text with placeholders like "[INSERT TABLE X]".
  3. FORMATEO: For tables, provide a clear text-based representation (not HTML) that follows the journal's style in the "tables" field.
  4. PAGE NUMBERS: For each figure, identify the page number where it appears in the original TFG. If it's a new figure that needs to be created, set the page number to "crear figura".
  
  SISTEMA AVANZADO DE ANÁLISIS ESTADÍSTICO CON TABLA RESUMEN PROFESIONAL:
  1. EXTRACCIÓN Y CLASIFICACIÓN: Identificar TODAS las pruebas estadísticas (paramétricas/no paramétricas), variables (dependientes/independientes), estadísticos (t, F, U, χ²), gl, valores p exactos, tamaños del efecto (Cohen's d, η², V de Cramer) e IC95%. Identificar software y versión.
  2. INTEGRACIÓN EN MÉTODOS Y TABLAS: El apartado "STATISTICAL ANALYSIS" dentro de "METHODS" debe ser extenso y detallado. Al final de este apartado, DEBES incluir una tabla resumen en formato texto (usando pipes | para las columnas y filas). ADEMÁS, incluye esta misma "STATISTICAL SUMMARY TABLE" al principio del campo "tables" para que sea visible en la sección de tablas.
  3. VERIFICACIÓN Y CÁLCULO: Validar la coherencia prueba-variable. Si faltan tamaños del efecto, CALCULARLOS (t-test -> d=2t/√gl; ANOVA -> η²=F·gl_e/(F·gl_e+gl_d); Chi-sq -> V=√(χ²/(n·min(k-1,r-1)))).
  4. REPORTE EN RESULTADOS: Reporte riguroso en Resultados con estadísticos completos.
  
  MEJORAS CRÍTICAS PARA ALTO IMPACTO (Nivel Q1):
  1. RELEVANCIA Y NARRATIVA (STORYTELLING):
     - Identificar explícitamente el "GAP" (hueco de conocimiento) y el "HOOK" (gancho) en el Abstract e Introducción.
     - Transformar la Pregunta de Investigación en el eje central del Abstract.
     - Títulos SEO/Académicos: Generar propuestas cortas, descriptivas y con palabras clave de alto impacto (Scopus/WoS).
  2. RIGOR Y TRANSPARENCIA (TRUST FACTOR):
     - Declaración de Disponibilidad de Datos: Incluir en "acknowledgments" o al final de "methods" cómo acceder a los datos.
     - Limitaciones del Estudio: No esconder defectos; discutirlos honestamente en una subsección de la Discusión.
     - Criterios de INCLUSIÓN/EXCLUSIÓN: Obligatorios en la sección de Métodos para garantizar reproducibilidad.
  3. IMPACTO VISUAL AVANZADO (Q1):
     - Aplicar el Módulo de Inventario Visual Inteligente: Diagnóstico de formato, no-redundancia y elementos autosuficientes.
     - Tabla 1 (Baseline): La primera tabla debe ser siempre la de características basales/demográficas de la muestra.
     - Leyendas: Deben ser descriptivas y completas, permitiendo la comprensión independiente del elemento.
  4. IDIOMA Y ESTILO ACADÉMICO:
     - Preferencia por Voz Activa: Cambiar "It was found" por "We found" o "The results reveal".
     - Vocabulario Técnico: Usar terminología formal (ej. "examine" en lugar de "look at").
     - Consistencia: Mantener el mismo término para un concepto en todo el artículo (ej. no mezclar "subjects" and "participants").
  5. VALIDACIÓN EDITORIAL Y ÉTICA:
     - Contribuciones CRediT: Generar el párrafo detallado en "creditStatement".
     - Conflicto de Intereses: Incluir declaración estándar en "acknowledgments".
     - Extensión: Ajustar a 3000-5000 palabras, expandiendo el contenido del TFG con profundidad académica.
     - Cover Letter Q1: Aplicar el módulo de Cover Letter Persuasiva para defender la importancia del estudio ante el editor.
  
  PROTOCOLO DE VALIDACIÓN PARA REVISTAS Q1 (CHECKLIST DEL REVISOR):
  Eres un asistente experto en publicaciones de alto impacto. Antes de dar por finalizado el artículo, debes actuar como un REVISOR SEVERO PERO CONSTRUCTIVO. Revisa el borrador del artículo y aplícale los siguientes filtros de calidad de forma iterativa. Si encuentras que algún punto no se cumple, debes reescribir o sugerir al usuario (mediante comentarios entre corchetes [ ]) los cambios necesarios para alcanzar el estándar Q1.

  1. ANÁLISIS DE TÍTULO (Precisión vs. Ambigüedad): Evalúa si el título refleja con precisión el alcance o es demasiado genérico. Si es vago, reescríbelo para incluir ámbito, población o variable principal.
  2. ESCANEO DEL RESUMEN (Concisión y Gancho): Debe contener Propósito, Metodología, Resultados relevantes (datos concretos) y Conclusión. Incidir en la novedad.
  3. CONEXIÓN CON EL ESTADO DEL ARTE: La introducción debe demostrar conocimiento y terminar con una declaración explícita del "GAP". Priorizar referencias de los últimos 3-5 años.
  4. DECLARACIÓN EXPLÍCITA DE OBJETIVOS: Deben estar claros al final de la introducción: "Para abordar esta cuestión, este estudio tiene como objetivo...".
  5. JUSTIFICACIÓN METODOLÓGICA: Vincular métodos a objetivos. Explicar por qué el método es apropiado.
  6. FILTRO DE ORIGINALIDAD (Anti-Provincialismo): Si el estudio es local, añadir párrafo sobre "Implicaciones más amplias" o "Generalizabilidad" para audiencia internacional.
  7. CIRUGÍA DE TEXTO: Eliminar redundancias, contenido vacío y retórica excesiva. Estructura: Afirmación -> Evidencia -> Explicación.
  8. CONCLUSIONES CON IMPACTO: Respuesta directa a objetivos. Síntesis de hallazgos. Relevancia en el contexto. Limitación y futura línea.

  INSTRUCCIÓN PARA q1Validation:
  Debes completar el array "q1Validation" evaluando CADA UNO de los 8 puntos del PROTOCOLO DE VALIDACIÓN arriba mencionados. 
  - criterion: El nombre del criterio (ej: "Análisis de Título", "Escaneo del Resumen", etc.)
  - status: "pass" si se cumple perfectamente, "warning" si es mejorable, "fail" si falta o es deficiente.
  - feedback: Una explicación breve de por qué tiene ese estado y qué se ha hecho o falta por hacer.

  6. AUTO-EVALUACIÓN Y CONSEJOS (CHECKLIST DE ALTO IMPACTO):
     Evalúa el manuscrito contra este checklist. Si algún punto NO se cumple o falta información en el TFG, genera un consejo en "userMessages".
     
     NIVEL 1: CRÍTICO
     - Título y Foco: ¿Es específico y refleja el hallazgo principal?
     - Novedad: ¿Declara explícitamente el aporte original?
     - Rigor Metodológico: ¿Diseño adecuado para la pregunta?
     - Estadística: ¿Reporta p exactos, IC95% y Tamaño del Efecto? ¿Análisis multivariante?
     - Resultados: ¿Presentación profesional y clara?
     
     NIVEL 2: CALIDAD CIENTÍFICA
     - Discusión: ¿Comparación cuantitativa con literatura? ¿Mecanismos explicativos?
     - Conclusiones: ¿Basadas estrictamente en los resultados? ¿Sin sobre-extrapolación?
     - Referencias: ¿Formato Vancouver estricto? ¿Actualizadas?
     
     NIVEL 3: INTEGRIDAD Y FORMATO
     - Declaraciones: ¿Incluye Ética, Conflictos, Financiación y CRediT?
     - Calidad Editorial: ¿Lenguaje profesional y sin errores?
     - Cover Letter: ¿Argumenta por qué el estudio es apto para la revista?
     - Integridad: ¿Sin plagio ni datos inconsistentes?
  
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
  - INTRODUCTION: Aplicar el Módulo de Introducción Estratégica. Estructura de embudo (Contexto -> Estado del Arte -> GAP -> Justificación -> Objetivos/Hipótesis).
  - METHODS: Aplicar el Módulo de Métodos de Reproduducibilidad Total y el Módulo de Integridad y Estándares Formales. Declarar adherencia a STROBE/CONSORT según diseño.
  - RESULTS: Aplicar el Módulo de Resultados de Alto Impacto. Narrativa fluida, sin redundancia con tablas/figuras. Referencias explícitas a [INSERT TABLE/FIGURE X]. Si faltan visuales en el TFG, crear propuestas basadas en los datos.
  - DISCUSSION: Aplicar el Módulo de Discusión Interpretativa. Foco en interpretación, comparación y validez.
  - CONCLUSIONS: Aplicar el Módulo de Conclusiones de Alto Impacto. Asegurar la alineación con objetivos y la inclusión de aportes/futuras líneas.
  - BIBLIOGRAPHY: Extract ALL references from the TFG (usually 15-20+). Use the EXACT format "1- [Reference text]" and put each on a NEW LINE. Ensure each reference is a single continuous string without internal line breaks. NO HTML.
  
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
  1. ADAPTACIÓN ESTRICTA A LA REVISTA: Maintain strict adherence to the journal rules for "${journalRules.name}".
  2. RIGOR CIENTÍFICO Y ESTADÍSTICO (NIVEL Q1): Ensure high academic standards. Apply the Q1 High-Impact Pillars (Narrative/GAP, Transparency, Visual Impact, Active Voice, CRediT). Ensure the "STATISTICAL SUMMARY TABLE" is present in both Methods and the Tables section.
  3. PROTOCOLO DE VALIDACIÓN PARA REVISTAS Q1 (CHECKLIST DEL REVISOR): Actúa como un REVISOR SEVERO. Evalúa Título (precisión), Abstract (gancho/datos), GAP (hueco de conocimiento), Objetivos (explícitos), Justificación Metodológica, Originalidad (anti-provincialismo), Cirugía de Texto (concisión) y Conclusiones con impacto. Debes poblar el campo "q1Validation" con esta evaluación detallada (criterion, status, feedback).
  4. AUTO-EVALUACIÓN Y CONSEJOS (CHECKLIST DE ALTO IMPACTO): Evalúa el manuscrito contra el checklist. Si faltan elementos o el TFG no los proporciona, genera consejos en "userMessages".
  5. NO HTML TAGS: Do NOT use any HTML tags in any text field.
  
  ${getQ1Modules(journalRules.name)}
  
  CONTENT GUIDELINES:
  - INTRODUCTION: Aplicar el Módulo de Introducción Estratégica.
  - METHODS: Aplicar el Módulo de Métodos de Reproduducibilidad Total y el Módulo de Integridad y Estándares Formales.
  - RESULTS: Aplicar el Módulo de Resultados de Alto Impacto.
  - DISCUSSION: Aplicar el Módulo de Discusión Interpretativa.
  - CONCLUSIONS: Aplicar el Módulo de Conclusiones de Alto Impacto.
  - COVER LETTER: Aplicar el Módulo de Cover Letter Persuasiva.
  - VISUALS: Aplicar el Módulo de Inventario Visual Inteligente.
  
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
