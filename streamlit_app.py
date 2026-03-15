import streamlit as st
import google.generativeai as genai
import json
import os
from PyPDF2 import PdfReader
import docx
import time

# Configure Gemini
# You should set your API key in Streamlit Secrets or as an environment variable
api_key = st.sidebar.text_input("Gemini API Key", type="password")
if not api_key:
    st.info("Please enter your Gemini API Key to continue.", icon="🗝️")
    st.stop()

genai.configure(api_key=api_key)

def extract_text_from_pdf(file):
    pdf_reader = PdfReader(file)
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text()
    return text

def extract_text_from_docx(file):
    doc = docx.Document(file)
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

def parse_file(uploaded_file):
    if uploaded_file.type == "application/pdf":
        return extract_text_from_pdf(uploaded_file)
    elif uploaded_file.type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return extract_text_from_docx(uploaded_file)
    else:
        return uploaded_file.read().decode("utf-8")

def generate_article(tfg_text, journal_name, journal_rules):
    model = genai.GenerativeModel("gemini-3.1-pro-preview")
    
    prompt = f"""You are an expert scientific editor. Transform the following TFG into a high-impact journal article for the journal "{journal_name}".
    
    STRICTLY FOLLOW THESE RULES:
    1. ADAPTATION: Use the provided journal rules: {journal_rules[:10000]}
    2. RIGOR: Ensure high scientific rigor (reproducible methods, robust stats, critical discussion).
    3. STRUCTURE: Use IMRyD+ (Introduction, Methods, Results, Discussion, Conclusions).
    4. METADATA: Generate title, abstract, keywords, and cover letter.
    5. LANGUAGE: Provide the output in English.
    
    TFG Text: {tfg_text[:20000]}..."""

    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            response_mime_type="application/json",
        )
    )
    return json.loads(response.text)

# UI Setup
st.set_page_config(page_title="TFG to High-Impact Paper", page_icon="⚡", layout="wide")

st.title("⚡ TFG to High-Impact Paper")
st.markdown("Transform your undergraduate thesis into a professional scientific manuscript.")

col1, col2 = st.columns([1, 2])

with col1:
    st.header("Step 1: Upload TFG")
    tfg_file = st.file_uploader("Upload your TFG (PDF, DOCX, TXT)", type=["pdf", "docx", "txt"])
    
    st.header("Step 2: Journal Config")
    journal_name = st.text_input("Target Journal Name", placeholder="e.g. Nature, Lancet")
    rules_file = st.file_uploader("Upload Guide for Authors (PDF, TXT)", type=["pdf", "txt"])

    if st.button("Generate High-Impact Draft", type="primary", use_container_width=True):
        if not tfg_file or not journal_name or not rules_file:
            st.error("Please provide all required inputs.")
        else:
            with st.status("Transforming your Research...", expanded=True) as status:
                st.write("Analyzing TFG structure...")
                tfg_text = parse_file(tfg_file)
                
                st.write(f"Adapting to {journal_name} guidelines...")
                rules_text = parse_file(rules_file)
                
                st.write("Drafting manuscript sections...")
                try:
                    result = generate_article(tfg_text, journal_name, rules_text)
                    st.session_state.result = result
                    st.session_state.journal_name = journal_name
                    status.update(label="Manuscript ready!", state="complete", expanded=False)
                except Exception as e:
                    st.error(f"Generation failed: {str(e)}")

if "result" in st.session_state:
    with col2:
        res = st.session_state.result
        st.success(f"Manuscript Generated for {st.session_state.journal_name}")
        st.subheader(res['title'])
        
        st.info(f"**Rigor Diagnosis:** {res['diagnosis']}")
        
        tabs = st.tabs(["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusions", "Checklist", "Cover Letter"])
        
        with tabs[0]:
            st.write(res['abstract'])
            st.write("**Keywords:** " + ", ".join(res['keywords']))
        with tabs[1]:
            st.write(res['introduction'])
        with tabs[2]:
            st.write(res['methods'])
        with tabs[3]:
            st.write(res['results'])
        with tabs[4]:
            st.write(res['discussion'])
        with tabs[5]:
            st.write(res['conclusions'])
        with tabs[6]:
            for item in res['checklist']:
                st.checkbox(item, value=True, disabled=True)
        with tabs[7]:
            st.write(res['coverLetter'])
            
        st.download_button(
            label="Download Full Manuscript",
            data=f"TITLE: {res['title']}\n\nABSTRACT:\n{res['abstract']}\n\nINTRODUCTION:\n{res['introduction']}\n\nMETHODS:\n{res['methods']}\n\nRESULTS:\n{res['results']}\n\nDISCUSSION:\n{res['discussion']}\n\nCONCLUSIONS:\n{res['conclusions']}",
            file_name=f"Manuscript_{st.session_state.journal_name}.txt",
            mime="text/plain"
        )
else:
    with col2:
        st.info("Your generated manuscript will appear here after processing.")
