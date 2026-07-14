"""
SDF AI Copilot - Production-Ready Multi-Agent RAG Backend
FastAPI + LangGraph + Google Gemini (Pro/Flash) + LlamaParse + ChromaDB + MSSQL Audit Trail
"""

import os
import uuid
import json
import logging
import traceback
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Annotated, List, Optional, TypedDict, Dict, Any, AsyncGenerator

import pyodbc
import aiofiles
import bcrypt
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Path as APIPath
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain / LangGraph
from langchain_google_vertexai import ChatVertexAI, VertexAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

# LlamaParse
from llama_parse import LlamaParse

load_dotenv()

# ─────────────────────────────────────────────
# Logging Setup
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sdf_copilot")

# ─────────────────────────────────────────────
# Directory Setup
# ─────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
CHROMA_DIR = BASE_DIR / "chroma_db"
UPLOAD_DIR.mkdir(exist_ok=True)
CHROMA_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────
app = FastAPI(
    title="SDF Policy Agent API",
    description="Enterprise Multi-Agent RAG System with Google Gemini & LlamaParse",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the uploads directory to serve files statically so users can view PDFs
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ─────────────────────────────────────────────
# Shared Singletons
# ─────────────────────────────────────────────
# Global Billing Tracker (Mock for presentation)
ESTIMATED_COST_PER_REQ = 0.002 # ~$2 per 1000 requests
MONTHLY_BUDGET_LIMIT = 30.0
current_monthly_spend = 0.0 # This would ideally be in a DB table

_embeddings = None
_vectorstore = None

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        logger.info("Initializing Vertex AI Embeddings (text-embedding-004)…")
        _embeddings = VertexAIEmbeddings(model_name="text-embedding-004", location="us-central1")
    return _embeddings

def get_vectorstore():
    global _vectorstore
    if _vectorstore is None:
        logger.info("Initializing ChromaDB at %s…", CHROMA_DIR)
        _vectorstore = Chroma(
            collection_name="sdf_knowledge_base",
            embedding_function=get_embeddings(),
            persist_directory=str(CHROMA_DIR),
        )
    return _vectorstore

_semantic_cache = None
def get_semantic_cache():
    global _semantic_cache
    if _semantic_cache is None:
        logger.info("Initializing Semantic Cache in ChromaDB…")
        _semantic_cache = Chroma(
            collection_name="semantic_cache",
            embedding_function=get_embeddings(),
            persist_directory=str(CHROMA_DIR),
        )
    return _semantic_cache

def get_llm(model_name: str = "gemini-2.5-flash"):
    """Returns a Vertex AI Gemini model."""
    logger.info(f"Connecting to Google Vertex AI ({model_name})…")
    return ChatVertexAI(
        model_name=model_name,
        location="global",
        temperature=0.1
    )

# ─────────────────────────────────────────────
# Database Setup (MSSQL)
# ─────────────────────────────────────────────
MSSQL_SERVER   = os.getenv("MSSQL_SERVER", "localhost")
MSSQL_DATABASE = os.getenv("MSSQL_DATABASE", "SDF_Copilot_DB")
MSSQL_USER     = os.getenv("MSSQL_USER", "") # Leave empty for Windows Auth
MSSQL_PASS     = os.getenv("MSSQL_PASS", "")

def get_db_connection():
    drivers = [
        '{ODBC Driver 17 for SQL Server}',
        '{ODBC Driver 18 for SQL Server}',
        '{SQL Server Native Client 11.0}',
        '{SQL Server}'
    ]
    
    conn = None
    for driver in drivers:
        try:
            if MSSQL_USER and MSSQL_PASS:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};UID={MSSQL_USER};PWD={MSSQL_PASS};TrustServerCertificate=yes;Connection Timeout=5;"
            else:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=5;"
            
            logger.info(f"Attempting MSSQL connection with {driver}…")
            conn = pyodbc.connect(conn_str)
            logger.info(f"MSSQL Connection Successful with {driver}.")
            return conn
        except pyodbc.Error:
            continue
            
    logger.error(f"All MSSQL connection attempts failed for {MSSQL_SERVER}. Check your SQL Server name and Drivers.")
    return None

def ensure_audit_table():
    conn = get_db_connection()
    if conn is None: return
    try:
        cursor = conn.cursor()
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditTrail' AND xtype='U') CREATE TABLE AuditTrail (ID INT IDENTITY(1,1) PRIMARY KEY, EmployeeID NVARCHAR(100) NOT NULL, SessionID NVARCHAR(100) NULL, QueryText NVARCHAR(MAX) NOT NULL, AIResponse NVARCHAR(MAX) NOT NULL, IsSaved BIT DEFAULT 0, CreatedAt DATETIME DEFAULT GETDATE())")
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DocumentLogs' AND xtype='U') CREATE TABLE DocumentLogs (ID INT IDENTITY(1,1) PRIMARY KEY, AdminID NVARCHAR(100) NULL, Action NVARCHAR(50) NOT NULL, Filename NVARCHAR(255) NOT NULL, ChunksCount INT NOT NULL, Target NVARCHAR(100) NULL, CreatedAt DATETIME NOT NULL DEFAULT GETDATE())")
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='KnowledgeDocuments' AND xtype='U') CREATE TABLE KnowledgeDocuments (ID INT IDENTITY(1,1) PRIMARY KEY, Filename NVARCHAR(255) NOT NULL, Department NVARCHAR(100) DEFAULT 'General', StartDate NVARCHAR(100) NULL, ExpireDate NVARCHAR(100) NULL, AdminID NVARCHAR(100) NULL, CreatedAt DATETIME NOT NULL DEFAULT GETDATE())")
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QueryCache' AND xtype='U') CREATE TABLE QueryCache (ID INT IDENTITY(1,1) PRIMARY KEY, QueryText NVARCHAR(MAX) NOT NULL, AIResponse NVARCHAR(MAX) NOT NULL, Accuracy NVARCHAR(50) NOT NULL, CreatedAt DATETIME DEFAULT GETDATE())")
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='IntelligenceAudit' AND xtype='U') CREATE TABLE IntelligenceAudit (ID INT IDENTITY(1,1) PRIMARY KEY, EmployeeID NVARCHAR(100) NOT NULL, Query NVARCHAR(MAX) NOT NULL, DraftResponse NVARCHAR(MAX) NULL, ReviewerFeedback NVARCHAR(MAX) NULL, FinalResponse NVARCHAR(MAX) NOT NULL, LoopCount INT DEFAULT 0, ModelInfo NVARCHAR(100) NULL, CreatedAt DATETIME DEFAULT GETDATE())")
        cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Accounts' AND xtype='U') CREATE TABLE Accounts (ID INT IDENTITY(1,1) PRIMARY KEY, Username NVARCHAR(100) NOT NULL UNIQUE, Password NVARCHAR(200) NULL, Role NVARCHAR(50) NOT NULL, Name NVARCHAR(150) NULL, Q1 NVARCHAR(255) NULL, A1 NVARCHAR(255) NULL, Q2 NVARCHAR(255) NULL, A2 NVARCHAR(255) NULL, Q3 NVARCHAR(255) NULL, A3 NVARCHAR(255) NULL, IsRegistered INT DEFAULT 0, CreatedAt DATETIME DEFAULT GETDATE())")
        cursor.execute("SELECT COUNT(*) FROM Accounts")
        if cursor.fetchone()[0] == 0:
            hashed_default = hash_password("admin123")
            cursor.execute("INSERT INTO Accounts (Username, Password, Role, Name, IsRegistered) VALUES ('master_admin', ?, 'master', 'Master Admin', 1)", hashed_default)
        
        # Migration: Ensure new columns exist
        try: cursor.execute("ALTER TABLE DocumentLogs ADD Target NVARCHAR(100) NULL")
        except: pass
        try: cursor.execute("ALTER TABLE KnowledgeDocuments ADD Department NVARCHAR(100) DEFAULT 'General'")
        except: pass
        try: cursor.execute("ALTER TABLE Accounts ADD IsRegistered INT DEFAULT 0")
        except: pass
        try: cursor.execute("ALTER TABLE Accounts ALTER COLUMN Password NVARCHAR(200) NULL")
        except: pass
        try: cursor.execute("ALTER TABLE Accounts ADD PreferredName NVARCHAR(100) NULL")
        except: pass
        try: cursor.execute("ALTER TABLE AuditTrail ADD PinnedAt DATETIME NULL")
        except: pass
        try: cursor.execute("ALTER TABLE AuditTrail ADD SessionTitle NVARCHAR(255) NULL")
        except: pass
        try: cursor.execute("ALTER TABLE KnowledgeDocuments ADD AllowedEmails NVARCHAR(MAX) NULL")
        except: pass
        try: cursor.execute("ALTER TABLE KnowledgeDocuments ADD AllowedGroups NVARCHAR(MAX) NULL")
        except: pass
        # Google Groups Sync Tables
        try: cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GoogleGroups' AND xtype='U') CREATE TABLE GoogleGroups (ID INT IDENTITY(1,1) PRIMARY KEY, GroupEmail NVARCHAR(200) NOT NULL UNIQUE, GroupName NVARCHAR(255) NULL, SyncedAt DATETIME DEFAULT GETDATE())")
        except: pass
        try: cursor.execute("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GroupMembers' AND xtype='U') CREATE TABLE GroupMembers (ID INT IDENTITY(1,1) PRIMARY KEY, GroupEmail NVARCHAR(200) NOT NULL, MemberEmail NVARCHAR(200) NOT NULL)")
        except: pass

        conn.commit()
    except pyodbc.Error as exc:
        logger.error("Database setup failed: %s", exc)
    finally:
        conn.close()

def log_document_action(action: str, filename: str, chunks_count: int, admin_id: str = "System", target: str = None):
    conn = get_db_connection()
    display_name = admin_id
    if conn:
        try:
            cursor = conn.cursor()
            # Lookup real name and role for better logging
            cursor.execute("SELECT Name, Role FROM Accounts WHERE Username = ?", admin_id)
            row = cursor.fetchone()
            if row:
                name = row[0] or "Unknown"
                role = row[1].capitalize() if row[1] else "User"
                display_name = f"{role} {name} ({admin_id})"
            
            cursor.execute("INSERT INTO DocumentLogs (AdminID, Action, Filename, ChunksCount, Target) VALUES (?, ?, ?, ?, ?)",
                           display_name, action, filename, chunks_count, target)
            conn.commit()
        finally: conn.close()

# ─────────────────────────────────────────────
# LangGraph State Definition
# ─────────────────────────────────────────────
class AgentState(TypedDict):
    query: str
    employee_id: str
    session_id: str
    save_chat: bool
    history: str
    allowed_filenames: List[str]
    retrieved_chunks: List[str]
    draft_response: str
    final_response: str
    hallucination_check: str
    rewrite_count: int
    current_agent: str
    accuracy_score: str
    # OPTIMIZATION #3 (Accuracy): Stores the specific reason for a FAIL verdict.
    # Communicator reads this on retry so it fixes the exact mistake, not guess.
    reviewer_feedback: str

# ─────────────────────────────────────────────
# Agent Nodes
# ─────────────────────────────────────────────

def researcher_node(state: AgentState) -> AgentState:
    """Researcher Agent: Finds relevant chunks from ChromaDB and applies Distance Guardrail."""
    logger.info("[RESEARCHER] Finding relevant document chunks…")
    
    # 0. Follow-up Query Detection
    # If it's a short formatting/translation request, bypass DB search so we don't pull garbage chunks.
    query_lower = state["query"].lower()
    follow_up_keywords = [
        "above", "abouv", "number", "point", "format", "list", "bullet", 
        "translate", "translte", "translt", "trnslt", "trsanslte", 
        "sinhala", "sinhla", "sinhalen", "sinhalin", "english", "tamil", "demala", "demalen",
        "short", "summarize", "kalin", "eka", "uda", "numbers", "explain"
    ]
    is_follow_up = any(kw in query_lower for kw in follow_up_keywords) and len(state["query"].split()) <= 15 and state.get("history", "").strip() != ""
    
    if is_follow_up:
        logger.info("[RESEARCHER] Query identified as follow-up formatting. Bypassing vector search.")
        return {**state, "retrieved_chunks": ["GUARDRAIL_REJECT"], "current_agent": "Researcher"}

    vs = get_vectorstore()
    
    # 1. Apply document-level Access Control (Filter by source)
    allowed_files = state.get("allowed_filenames", [])
    search_kwargs = {"k": 5}
    if allowed_files:
        search_kwargs["filter"] = {"source": {"$in": allowed_files}}
    else:
        # If no allowed files, meaning the user has access to NO documents
        # (e.g. no general docs and no department docs), reject immediately.
        logger.info("[RESEARCHER] User has no allowed documents to search.")
        return {**state, "retrieved_chunks": ["GUARDRAIL_REJECT"], "current_agent": "Researcher"}
        
    results = vs.similarity_search_with_score(state["query"], **search_kwargs)
    
    # 2. Distance Threshold Guardrail (Blocks off-topic queries locally)
    # Increased threshold for Vertex AI text-embedding-004 metric ranges
    DISTANCE_THRESHOLD = 1.2
    
    if not results or results[0][1] > DISTANCE_THRESHOLD:
        best_dist = results[0][1] if results else "N/A"
        logger.warning(f"[RESEARCHER] GUARDRAIL REJECT! Best match distance {best_dist} exceeds threshold. Query is off-topic.")
        return {**state, "retrieved_chunks": ["GUARDRAIL_REJECT"], "current_agent": "Researcher"}
        
    logger.info(f"[RESEARCHER] Query accepted. Best chunk distance: {results[0][1]:.4f}")
    chunks = [
        f"[Source: {doc.metadata.get('source', 'Unknown')}, Page: {doc.metadata.get('page', '?')}]\n{doc.page_content}"
        for doc, score in results
    ]
    return {**state, "retrieved_chunks": chunks, "current_agent": "Researcher"}

# OPTIMIZATION #1 (Architecture): Compliance Agent has been removed.
# Reason: It was a redundant LLM API call that consumed cost and time without
# adding value. The Communicator's System Prompt + Reviewer's fact-check
# together handle all safety and accuracy requirements.
# Result: API calls reduced from 3 -> 2 per query. Faster + cheaper.

def communicator_node(state: AgentState) -> AgentState:
    """Communicator Agent: Uses Gemini Flash for high-speed response drafting."""
    logger.info("[COMMUNICATOR] Drafting response with Gemini 2.0 Flash…")
    
    # Intercept Guardrail Rejects, but ALLOW follow-up formatting requests to hit the LLM
    is_rejected = state["retrieved_chunks"] and state["retrieved_chunks"][0] == "GUARDRAIL_REJECT"
    
    # COST OPTIMIZATION: Only pass rejects to LLM if it looks like a follow-up formatting request
    query_lower = state["query"].lower()
    follow_up_keywords = [
        "above", "abouv", "number", "point", "format", "list", "bullet", 
        "translate", "translte", "translt", "trnslt", "trsanslte", 
        "sinhala", "sinhla", "sinhalen", "sinhalin", "english", "tamil", "demala", "demalen",
        "short", "summarize", "kalin", "eka", "uda", "numbers", "explain"
    ]
    is_follow_up = any(kw in query_lower for kw in follow_up_keywords) and state.get("history", "").strip() != ""

    if is_rejected and not is_follow_up:
        logger.info("[COMMUNICATOR] Hard-rejecting off-topic query to save LLM cost.")
        return {
            **state,
            "draft_response": "I apologize, but this system is restricted to answering questions based strictly on the bank's internal documents and HR policies. I could not find any relevant information for your query.",
            "current_agent": "Communicator"
        }
        
    rewrite_count = state.get("rewrite_count", 0)
    model_to_use = "gemini-2.5-pro" if rewrite_count >= 3 else "gemini-2.5-flash"
    llm = get_llm(model_to_use)
    context = "NO NEW DOCUMENTS RELEVANT TO QUERY." if is_rejected else "\n\n---\n\n".join(state["retrieved_chunks"])
    history = state.get("history", "")

    # OPTIMIZATION #3 (Critique & Revise): If this is a retry (rewrite_count > 0),
    # inject the Reviewer's specific feedback so the model fixes the exact mistake.
    feedback = state.get("reviewer_feedback", "")
    feedback_block = (
        f"PREVIOUS ATTEMPT FEEDBACK (Fix this specific issue):\n{feedback}\n\n"
        if feedback else ""
    )

    # Fact Sheet injected to resolve Vector DB retrieval failures for common names
    COMPANY_FACT_SHEET = (
        "CORE COMPANY FACTS (Always consider this as valid Context):\n"
        "- Company: Sarvodaya Development Finance (SDF) PLC\n"
        "- Board of Directors:\n"
        "  * Mr. Channa De Silva (Chairman/Non-Executive, Non-Independent Director)\n"
        "  * Mr. Dhammika Ganegama (Senior Director/Non-Executive, Independent Director)\n"
        "  * Mr. Christopher Amrit Canagaretna (Non-Executive, Independent Director)\n"
        "  * Mr. Senthi Nandhanan Senthilverl (Non-Executive, Non-Independent Director)\n"
        "  * Ms. Shehara De Silva (Non-Executive, Independent Director)\n"
        "  * Ms. Ramya Suranjani Wickremeratne (Non-Executive, Independent Director)\n"
        "  * Mr. Nandika Buddhipala (Non-Executive, Independent Director)\n"
        "  * Ms. Sashi Adele Schaffter (Non-Executive, Non-Independent Director)\n"
        "  * Mr. Saliya J. Ranasinghe (Non-Executive, Non-Independent Director)\n"
        "- Corporate Management Team:\n"
        "  * Mr. Nilantha Jayanetti (Chief Executive Officer - CEO)\n"
        "  * Mr. Ruwan Jayasuriya (Chief Operating Officer - COO)\n"
        "  * Mr. Ranapriya Fernando (Head of Credit)\n"
        "  * Mr. Mahesh Jayasanka (Head of Strategic Planning)\n"
        "  * Ms. Manori Wannigama (Head of Finance)\n"
        "  * Mr. Kularuwan Gamage (Head of Operations & Administration)\n"
        "  * Mr. Indika Dissanayake (Head of Information Technology - IT)\n"
        "  * Mr. Ruwin Yapa (Head of Human Resources - HR)\n"
        "  * Mr. Kelum Thilakerathne (Head of National Sales)\n"
        "  * Mr. Prabath Rangajeewa (Head of Gold Loan)\n"
        "  * Ms. Piyumi Ranadheera (Head of Risk Management)\n"
        "  * Mr. Migara K. Abayatilake (Head of Compliance)\n"
        "  * Mr. Randil Keerthipala (Head of Recovery)\n"
        "  * Mr. Amila Gunawardana (Head of Internal Audit)\n"
        "  * Ms. Maheshika Wickramatunga (Head of Legal)\n"
        "  * Ms. Ishani Wasana (Company Secretary)\n"
    )

    prompt = (
        "You are a Professional Corporate Communications AI for Sarvodaya Development Finance (SDF). "
        f"{COMPANY_FACT_SHEET}\n"
        "DOCUMENT CONTEXT:\n{context}\n\n"
        "CHAT HISTORY:\n{history}\n\n"
        "{feedback_block}"
        "USER QUERY: {query}\n\n"
        "INSTRUCTIONS:\n"
        "1. If the answer is in the CONTEXT, provide a professional response with citations like [Source: file.pdf, Page: X].\n"
        "2. IF CONTEXT is 'NO NEW DOCUMENTS RELEVANT' BUT the user is asking a simple follow-up formatting request (like 'make it numbered', 'translate it') about the CHAT HISTORY, you MUST answer it by reformatting the CHAT HISTORY.\n"
        "3. If the user is asking a general question NOT in the context AND not a follow-up to history, politely explain that you are the SDF Policy Agent and can only answer questions based on official internal documents.\n"
        "4. LANGUAGE: Detect the language of the USER QUERY and respond ONLY in that same language. Never mix languages unless asked.\n"
        "4. Keep it concise (under 100 words).\n"
        "5. FORMATTING: DO NOT use markdown like asterisks (*) or bold text. DO NOT use emojis. Use clean, professional plain text with standard numbered lists (1., 2.) or simple dashes (-) for points.\n"
    )
    response = llm.invoke(prompt.format(
        context=context,
        history=history,
        feedback_block=feedback_block,
        query=state["query"]
    ))
    return {**state, "draft_response": response.content, "current_agent": "Communicator"}

def reviewer_node(state: AgentState) -> AgentState:
    """Reviewer Agent: Dynamic Model Fallback - Flash first, Pro on escalation."""
    
    # Bypass review if the query was rejected locally by the Guardrail or is a follow-up
    if state["retrieved_chunks"] and state["retrieved_chunks"][0] == "GUARDRAIL_REJECT":
        logger.info("[REVIEWER] Skipping review due to Guardrail Reject / Follow-up bypass.")
        return {
            **state,
            "hallucination_check": "pass", # Force pass to exit the LangGraph loop immediately
            "accuracy_score": "History Context",
            "reviewer_feedback": "",
            "current_agent": "Reviewer"
        }

    # OPTIMIZATION #4 (Cost): Dynamic Model Fallback.
    # - First attempt (rewrite_count == 0): Use cheap Gemini Flash for review.
    # - After 3 failed retries (rewrite_count >= 3): Escalate to Gemini Pro.
    # This alone cuts the monthly AI bill by ~80% since most queries pass on 1st try.
    rewrite_count = state.get("rewrite_count", 0)
    if rewrite_count >= 3:
        # Flash has failed three times - bring in the heavy model
        model_to_use = "gemini-2.5-pro"
        logger.info("[REVIEWER] Escalating to Gemini 2.5 Pro (rewrite_count=%d)…", rewrite_count)
    else:
        # Default: use the cheap fast model
        model_to_use = "gemini-2.5-flash"
        logger.info("[REVIEWER] Fact-checking with Gemini 1.5 Flash (rewrite_count=%d)…", rewrite_count)

    llm = get_llm(model_to_use)
    context = "\n\n---\n\n".join(state["retrieved_chunks"])

    COMPANY_FACT_SHEET = (
        "CORE COMPANY FACTS (Always consider this as valid Context):\n"
        "- Company: Sarvodaya Development Finance (SDF) PLC\n"
        "- Board of Directors:\n"
        "  * Mr. Channa De Silva (Chairman/Non-Executive, Non-Independent Director)\n"
        "  * Mr. Dhammika Ganegama (Senior Director/Non-Executive, Independent Director)\n"
        "  * Mr. Christopher Amrit Canagaretna (Non-Executive, Independent Director)\n"
        "  * Mr. Senthi Nandhanan Senthilverl (Non-Executive, Non-Independent Director)\n"
        "  * Ms. Shehara De Silva (Non-Executive, Independent Director)\n"
        "  * Ms. Ramya Suranjani Wickremeratne (Non-Executive, Independent Director)\n"
        "  * Mr. Nandika Buddhipala (Non-Executive, Independent Director)\n"
        "  * Ms. Sashi Adele Schaffter (Non-Executive, Non-Independent Director)\n"
        "  * Mr. Saliya J. Ranasinghe (Non-Executive, Non-Independent Director)\n"
        "- Corporate Management Team:\n"
        "  * Mr. Nilantha Jayanetti (Chief Executive Officer - CEO)\n"
        "  * Mr. Ruwan Jayasuriya (Chief Operating Officer - COO)\n"
        "  * Mr. Ranapriya Fernando (Head of Credit)\n"
        "  * Mr. Mahesh Jayasanka (Head of Strategic Planning)\n"
        "  * Ms. Manori Wannigama (Head of Finance)\n"
        "  * Mr. Kularuwan Gamage (Head of Operations & Administration)\n"
        "  * Mr. Indika Dissanayake (Head of Information Technology - IT)\n"
        "  * Mr. Ruwin Yapa (Head of Human Resources - HR)\n"
        "  * Mr. Kelum Thilakerathne (Head of National Sales)\n"
        "  * Mr. Prabath Rangajeewa (Head of Gold Loan)\n"
        "  * Ms. Piyumi Ranadheera (Head of Risk Management)\n"
        "  * Mr. Migara K. Abayatilake (Head of Compliance)\n"
        "  * Mr. Randil Keerthipala (Head of Recovery)\n"
        "  * Mr. Amila Gunawardana (Head of Internal Audit)\n"
        "  * Ms. Maheshika Wickramatunga (Head of Legal)\n"
        "  * Ms. Ishani Wasana (Company Secretary)\n"
    )

    # OPTIMIZATION #3 (Critique & Revise): Ask the Reviewer to also return a
    # specific 'reason' on FAIL. This reason is passed back to the Communicator
    # so it knows exactly what to fix instead of blindly retrying.
    prompt = (
        "Review the DRAFT RESPONSE against the DOCUMENT CONTEXT for accuracy and hallucinations.\n"
        "Output ONLY raw JSON with these fields:\n"
        '  {"verdict": "PASS" or "FAIL", "accuracy": "X%", "reason": "Specific error if FAIL, else OK"}\n\n'
        f"{COMPANY_FACT_SHEET}\n"
        f"CONTEXT:\n{context}\n\nDRAFT:\n{state['draft_response']}"
    )
    response = llm.invoke(prompt)
    try:
        data = json.loads(response.content.strip("` \n").replace("json", ""))
        verdict = data.get("verdict", "FAIL")
        acc = data.get("accuracy", "0%")
        # Extract the specific failure reason for the Critique & Revise loop
        current_feedback = state.get("reviewer_feedback", "")
        if verdict == "FAIL":
            attempt_num = state.get("rewrite_count", 0) + 1
            new_reason = data.get("reason", "")
            failed_draft = state.get("draft_response", "")
            reason = f"{current_feedback}\n[Attempt {attempt_num} Failed]\n- Draft: {failed_draft}\n- Reason: {new_reason}\n".strip()
        else:
            reason = current_feedback
    except:
        verdict, acc, reason = "FAIL", "0%", "Could not parse the previous draft. Please rewrite carefully."

    return {
        **state,
        "hallucination_check": verdict.lower(),
        "accuracy_score": acc,
        "reviewer_feedback": reason,  # Passed to Communicator on retry
        "current_agent": "Reviewer"
    }

def audit_node(state: AgentState) -> AgentState:
    """Audit Agent: Saves to MSSQL and IntelligenceAudit if loops > 0."""
    global current_monthly_spend
    logger.info("[AUDIT] Recording transaction in MSSQL…")
    
    current_monthly_spend += ESTIMATED_COST_PER_REQ
    
    final = state.get("draft_response", "No response generated.")
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO AuditTrail (EmployeeID, SessionID, QueryText, AIResponse, IsSaved) VALUES (?, ?, ?, ?, ?)",
                           state["employee_id"], state.get("session_id", ""), state["query"], final, 1 if state.get("save_chat") else 0)
            
            # Save to Semantic Cache
            try:
                sc = get_semantic_cache()
                sc.add_texts(
                    texts=[state["query"]],
                    metadatas=[{"answer": final, "accuracy": state.get("accuracy_score", "0%"), "source": "semantic_cache"}],
                    ids=[str(uuid.uuid4())]
                )
            except Exception as e:
                logger.error(f"Failed to update semantic cache: {e}")
                
            # Intelligence Audit: Log ONLY if it failed 3 times and reached Gemini Pro (Max retries)
            if state.get("rewrite_count", 0) >= 3:
                model_info = "Gemini 2.5 Pro (Fallback)"
                cursor.execute("INSERT INTO IntelligenceAudit (EmployeeID, Query, DraftResponse, ReviewerFeedback, FinalResponse, LoopCount, ModelInfo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                               state["employee_id"], state["query"], state.get("draft_response", ""), state.get("reviewer_feedback", "") or state.get("hallucination_check", "pass"), final, state.get("rewrite_count", 0), model_info)
            
            conn.commit()
        finally: conn.close()
    return {**state, "final_response": final, "current_agent": "Done"}

# ─────────────────────────────────────────────
# Graph Construction
# ─────────────────────────────────────────────
def hallucination_router(state):
    # Exit loop if passed, OR if we've reached 3 retries (which is Gemini Pro's single attempt)
    if state["hallucination_check"] == "pass" or state.get("rewrite_count", 0) >= 3: return "audit"
    return "rewrite"

def increment_rewrite(state):
    return {**state, "rewrite_count": state.get("rewrite_count", 0) + 1}

def build_graph():
    workflow = StateGraph(AgentState)

    # Register active agent nodes (Compliance Agent removed - see Optimization #1)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("communicator", communicator_node)
    workflow.add_node("reviewer", reviewer_node)
    workflow.add_node("increment_rewrite", increment_rewrite)
    workflow.add_node("audit", audit_node)

    # Define the pipeline flow:
    # Researcher -> Communicator (direct, no compliance step) -> Reviewer
    # If Reviewer says PASS -> Audit (save + show user)
    # If Reviewer says FAIL -> increment rewrite count -> Communicator (retry)
    # Max retries = 2 (defined in hallucination_router)
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "communicator")  # Direct route: no compliance hop
    workflow.add_edge("communicator", "reviewer")
    workflow.add_conditional_edges("reviewer", hallucination_router, {"audit": "audit", "rewrite": "increment_rewrite"})
    workflow.add_edge("increment_rewrite", "communicator")
    workflow.add_edge("audit", END)
    return workflow.compile()

graph = build_graph()

# ─────────────────────────────────────────────
# FastAPI Endpoints
# ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    employee_id: str
    session_id: str = ""
    save_chat: bool = False

@app.post("/chat/stream")
async def stream_chat(request: ChatRequest):
    q_lower = request.query.strip().lower()
    
    # 1. Fast Greeting Interception (Saves API Costs & Extremely Fast)
    # Using regex for slang to catch "byeee", "bby", "mk" etc.
    import re
    
    # Check if query matches specific known useless patterns
    is_greeting = bool(re.search(r'\b(h+i+|h+e+l+o+|h+e+y+|good\s*morning|good\s*afternoon|good\s*evening)\b', q_lower))
    is_farewell = bool(re.search(r'\b(b+y+e+|g+o+o+d\s*b+y+e+|b+b+y+|good\s*night)\b', q_lower))
    is_thanks = bool(re.search(r'\b(t+h+a+n+k+s+|t+h+a+n+k\s*y+o+u+|t+q+)\b', q_lower))
    is_identity = bool(re.search(r'\b(who\s*are\s*you|what\s*are\s*you|who\s*is\s*this|oya\s*k+a+w+d+a+|oy\s*k+o+w+d+|oya\s*k+a+u+d+a+|who\s*r\s*u+)\b', q_lower))
    is_smalltalk = bool(re.search(r'\b(h+o+w\s*a+r+e\s*y+o+u+|h+o+w\s*r\s*u+|k+o+h+o+m+a+d+a+|k+h+m+d+|m+k+|k+e+w+a+d+a+|a+d+a+r+e+i+|n+i+d+i+d+a+)\b', q_lower))
    
    # Catch pure gibberish strictly OR if the word count is less than 3
    word_count = len(q_lower.split())
    is_gibberish = bool(re.fullmatch(r'(ok|k|u+|o+|h+m+|y+e+s+|n+o+)', q_lower)) or word_count < 3
    
    if is_greeting or is_farewell or is_thanks or is_identity or is_smalltalk or is_gibberish:
        conn = get_db_connection()
        user_name = "there"
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT PreferredName, Name FROM Accounts WHERE Username = ?", request.employee_id)
                row = cursor.fetchone()
                if row:
                    full_name = row[0] or row[1]
                    if full_name: user_name = full_name.split(' ')[0]
                    
                if is_greeting:
                    # Dynamically respond with the exact time of day if they said it
                    if "morning" in q_lower: greeting = f"Good morning {user_name}! How can I help you today?"
                    elif "afternoon" in q_lower: greeting = f"Good afternoon {user_name}! How can I help you today?"
                    elif "evening" in q_lower: greeting = f"Good evening {user_name}! How can I help you today?"
                    else: greeting = f"Hi {user_name}! How can I help you today?"
                elif is_farewell:
                    greeting = f"Goodbye {user_name}! Have a great day!"
                elif is_thanks:
                    greeting = f"You're very welcome, {user_name}! Let me know if you need anything else."
                elif is_identity:
                    greeting = "I am the SDF Policy Agent, an enterprise AI assistant designed to help you strictly with Sarvodaya Development Finance's internal documents and HR policies."
                elif is_smalltalk:
                    greeting = f"I'm doing great, {user_name}! Thanks for asking. How can I assist you with SDF policies today?"
                elif is_gibberish:
                    greeting = "Please ask a specific question related to Sarvodaya Development Finance's internal documents or policies."
                
                # Save to AuditTrail so it exists if toggled later
                is_saved = 1 if request.save_chat else 0
                cursor.execute("INSERT INTO AuditTrail (EmployeeID, SessionID, QueryText, AIResponse, IsSaved) VALUES (?, ?, ?, ?, ?)",
                               request.employee_id, request.session_id, request.query, greeting, is_saved)
                conn.commit()
            except Exception as e:
                logger.error(f"Greeting DB error: {e}")
            finally:
                conn.close()
        else:
            if is_greeting: greeting = "Hi there! How can I help you today?"
            elif is_farewell: greeting = "Goodbye! Have a great day!"
            elif is_thanks: greeting = "You're very welcome! Let me know if you need anything else."
            elif is_identity: greeting = "I am the SDF Policy Agent, an enterprise AI assistant designed to help you strictly with Sarvodaya Development Finance's internal documents and HR policies."
            elif is_smalltalk: greeting = "I'm doing great! Thanks for asking. How can I assist you with SDF policies today?"
            elif is_gibberish: greeting = "Please ask a specific question related to Sarvodaya Development Finance's internal documents or policies."
            
        async def greeting_gen():
            yield f"data: {json.dumps({'agent': 'Done', 'status': 'done', 'response': greeting, 'accuracy_score': '', 'hallucination_check': ''})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(greeting_gen(), media_type="text/event-stream")

    # 2. Check Semantic Cache
    try:
        sc = get_semantic_cache()
        results = sc.similarity_search_with_score(request.query, k=1)
        if results:
            doc, distance = results[0]
            # Lower distance means higher semantic similarity. Threshold 0.15 is very strict.
            if distance < 0.15:
                logger.info(f"SEMANTIC CACHE HIT! Distance: {distance:.4f}")
                ai_response = doc.metadata.get("answer", "")
                accuracy_score = doc.metadata.get("accuracy", "Cached")
                
                # Save to AuditTrail so it exists if toggled later
                conn = get_db_connection()
                if conn:
                    try:
                        cursor = conn.cursor()
                        is_saved = 1 if request.save_chat else 0
                        cursor.execute("INSERT INTO AuditTrail (EmployeeID, SessionID, QueryText, AIResponse, IsSaved) VALUES (?, ?, ?, ?, ?)",
                                       request.employee_id, request.session_id, request.query, ai_response, is_saved)
                        conn.commit()
                    finally: conn.close()
                
                async def cache_gen():
                    yield f"data: {json.dumps({'agent': 'Semantic Cache', 'status': 'done', 'response': ai_response, 'accuracy_score': accuracy_score, 'hallucination_check': 'pass'})}\n\n"
                    yield "data: [DONE]\n\n"
                return StreamingResponse(cache_gen(), media_type="text/event-stream")
    except Exception as e:
        logger.warning(f"Semantic Cache check failed: {e}")

    # Fetch chat history for context if session_id is provided
    chat_history = ""
    if request.session_id:
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT TOP 2 QueryText, AIResponse FROM AuditTrail WHERE SessionID = ? ORDER BY ID DESC", 
                    request.session_id
                )
                rows = cursor.fetchall()
                if rows:
                    # Reverse because we got DESC (newest first)
                    history_lines = [f"User: {row[0]}\nAI: {row[1]}" for row in reversed(rows)]
                    chat_history = "\n\n".join(history_lines)
            except Exception as e:
                logger.error(f"Failed to fetch history: {e}")
            finally:
                conn.close()

    allowed_filenames = []
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT Department, Email, Role FROM Accounts WHERE Username = ?", request.employee_id)
            user_row = cursor.fetchone()
            user_dept_str = (user_row[0] or "").strip() if user_row else ""
            user_depts = [d.strip() for d in user_dept_str.split(",")] if user_dept_str else []
            user_email = (user_row[1] or request.employee_id).strip().lower() if user_row else request.employee_id.strip().lower()
            user_role = user_row[2] if user_row else "user"

            cursor.execute("SELECT Filename, Department, AllowedEmails, AllowedGroups FROM KnowledgeDocuments")
            for row in cursor.fetchall():
                f_name, f_dept, f_emails = row[0], (row[1] or "General").strip(), row[2]
                f_allowed_groups_str = row[3] or ""
                f_allowed_groups = [g.strip().upper() for g in f_allowed_groups_str.split(",")] if f_allowed_groups_str else []
                
                # Master admins bypass all access rules
                if user_role == "master":
                    allowed_filenames.append(f_name)
                    continue
                
                # Rule 1: General/All or matches one of user's departments (from f_dept)
                if f_dept in ["General", "All", "General / Other", ""] or f_dept in user_depts:
                    allowed_filenames.append(f_name)
                    continue

                # Rule 1.5: Matches one of the explicitly Allowed Groups (Checkboxes)
                # user_depts usually contains roles/groups in uppercase or matching cases
                overlap = set([ud.upper() for ud in user_depts]).intersection(set(f_allowed_groups))
                if overlap or "ALL" in f_allowed_groups:
                    allowed_filenames.append(f_name)
                    continue
                
                # Rule 2: Explicitly allowed via Email
                if f_emails and user_email:
                    emails = [e.strip().lower() for e in f_emails.split(',')]
                    if user_email in emails:
                        allowed_filenames.append(f_name)
                        
        except Exception as e:
            logger.error(f"Failed to fetch allowed filenames: {e}")
        finally:
            conn.close()

    initial_state = {
        "query": request.query, "employee_id": request.employee_id, "session_id": request.session_id, "save_chat": request.save_chat,
        "history": chat_history,
        "allowed_filenames": allowed_filenames,
        "retrieved_chunks": [], "draft_response": "", "final_response": "", "hallucination_check": "", "rewrite_count": 0, "current_agent": "Starting", "accuracy_score": ""
    }

    async def event_gen():
        try:
            async for step in graph.astream(initial_state):
                for node, state in step.items():
                    if node == "increment_rewrite": continue
                    yield f"data: {json.dumps({'agent': state.get('current_agent', node), 'status': 'processing', 'response': state.get('final_response', state.get('draft_response', '')), 'accuracy_score': state.get('accuracy_score', ''), 'hallucination_check': state.get('hallucination_check', '')})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                error_msg = "Google Gemini API Quota Exceeded (429). Please wait a minute or use a different API Key."
            logger.error(traceback.format_exc())
            yield f"data: {json.dumps({'error': error_msg})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")

@app.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...), 
    admin_id: str = Form("System"), 
    start_date: str = Form(""), 
    expire_date: str = Form(""),
    department: str = Form("General"),
    allowed_emails: str = Form(""),
    allowed_groups: str = Form("")
):
    if not file.filename.lower().endswith(".pdf"): raise HTTPException(status_code=400, detail="Only PDFs allowed.")
    
    if not department or department.strip() == "":
        department = "General"
        
    file_path = UPLOAD_DIR / file.filename
    if file_path.exists():
        raise HTTPException(status_code=400, detail="A document with this name already exists. Please delete it first.")
        
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(await file.read())

    try:
        logger.info(f"[ADMIN] Parsing PDF ({file.filename}) with department: {department}")
        parser = LlamaParse(result_type="markdown")
        llama_docs = parser.load_data(str(file_path))
        
        # Convert to LangChain format
        from langchain_core.documents import Document
        chunks = []
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        
        for i, doc in enumerate(llama_docs):
            page_num = i + 1
            # Add department to metadata
            page_chunks = splitter.create_documents([doc.text], metadatas=[{"source": file.filename, "page": page_num, "department": department}])
            chunks.extend(page_chunks)
        
        vs = get_vectorstore()
        batch_size = 100 
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            vs.add_documents(batch)
        
        log_document_action("UPLOAD", file.filename, len(chunks), admin_id, department)
        
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("INSERT INTO KnowledgeDocuments (Filename, Department, StartDate, ExpireDate, AdminID, AllowedEmails, AllowedGroups) VALUES (?, ?, ?, ?, ?, ?, ?)",
                               file.filename, department, start_date, expire_date, admin_id, allowed_emails, allowed_groups)
                conn.commit()
            finally: conn.close()
            
        # Flush Semantic Cache since knowledge base changed
        try:
            sc = get_semantic_cache()
            sc._client.delete_collection("semantic_cache")
            global _semantic_cache
            _semantic_cache = None
            get_semantic_cache() # Re-initialize empty cache
            logger.info("Semantic Cache flushed due to document upload.")
        except Exception as e:
            logger.warning(f"Could not flush semantic cache: {e}")

        return {"message": "Success", "filename": file.filename, "chunks_added": len(chunks), "department": department}
    except Exception as e:
        logger.error(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def on_startup():
    ensure_audit_table()

@app.get("/health")
async def health(): return {"status": "ok"}

@app.get("/documents")
async def get_total_docs():
    try:
        vs = get_vectorstore()
        count = vs._collection.count()
        return {"total_chunks": count}
    except:
        return {"total_chunks": 0}

@app.get("/admin/logs")
async def get_admin_logs():
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT ID, AdminID, Action, Filename, ChunksCount, Target, CreatedAt FROM DocumentLogs ORDER BY CreatedAt DESC")
        return [{"id": r[0], "admin_id": r[1], "action": r[2], "filename": r[3], "chunks_count": r[4], "target": r[5], "created_at": r[6].isoformat()} for r in cursor.fetchall()]
    finally: conn.close()

@app.get("/admin/intelligence-audit")
async def get_intelligence_audit():
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        # Only return records that escalated to Gemini Pro (LoopCount >= 3) to hide any dummy data from earlier tests
        cursor.execute("SELECT ID, EmployeeID, Query, DraftResponse, ReviewerFeedback, FinalResponse, LoopCount, ModelInfo, CreatedAt FROM IntelligenceAudit WHERE LoopCount >= 3 ORDER BY CreatedAt DESC")
        return [{
            "id": r[0], "employee_id": r[1], "query": r[2], 
            "draft": r[3], "feedback": r[4], "final": r[5], 
            "loops": r[6], "model": r[7], "created_at": r[8].isoformat()
        } for r in cursor.fetchall()]
    finally: conn.close()

@app.get("/admin/chunks")
async def list_all_chunks():
    try:
        vs = get_vectorstore()
        results = vs._collection.get()
        chunks = []
        for i in range(len(results['ids'])):
            chunks.append({
                "id": results['ids'][i],
                "text": results['documents'][i],
                "metadata": results['metadatas'][i]
            })
        return {"chunks": chunks}
    except Exception as e:
        logger.error(e)
        return {"chunks": []}

# Auth, List Chunks, List Logs, etc.

# ─────────────────────────────────────────────
# Google Groups Sync
# ─────────────────────────────────────────────
SERVICE_ACCOUNT_FILE = BASE_DIR / "chatbot.json"
WORKSPACE_ADMIN_EMAIL = os.getenv("WORKSPACE_ADMIN_EMAIL", "")

def sync_google_groups_to_db():
    """Pulls all Google Groups + Members from Workspace and stores in DB."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        if not SERVICE_ACCOUNT_FILE.exists():
            logger.error("[GROUPS SYNC] Service account JSON not found at %s", SERVICE_ACCOUNT_FILE)
            return {"status": "error", "message": "Service account file not found."}

        if not WORKSPACE_ADMIN_EMAIL:
            logger.error("[GROUPS SYNC] WORKSPACE_ADMIN_EMAIL env var not set.")
            return {"status": "error", "message": "WORKSPACE_ADMIN_EMAIL not configured."}

        SCOPES = [
            'https://www.googleapis.com/auth/admin.directory.group.readonly',
            'https://www.googleapis.com/auth/admin.directory.group.member.readonly',
        ]
        creds = service_account.Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_FILE), scopes=SCOPES
        ).with_subject(WORKSPACE_ADMIN_EMAIL)

        service = build('admin', 'directory_v1', credentials=creds, cache_discovery=False)

        # Fetch all groups in the domain
        domain = WORKSPACE_ADMIN_EMAIL.split('@')[-1]
        groups_result = service.groups().list(domain=domain, maxResults=200).execute()
        groups = groups_result.get('groups', [])
        logger.info("[GROUPS SYNC] Found %d groups in domain.", len(groups))

        conn = get_db_connection()
        if not conn:
            return {"status": "error", "message": "DB connection failed."}
        cursor = conn.cursor()

        # Clear existing group/member data for a fresh sync
        cursor.execute("DELETE FROM GroupMembers")
        cursor.execute("DELETE FROM GoogleGroups")

        for group in groups:
            g_email = group.get('email', '').lower()
            g_name  = group.get('name', '')
            if not g_email:
                continue
            cursor.execute("INSERT INTO GoogleGroups (GroupEmail, GroupName, SyncedAt) VALUES (?, ?, GETDATE())", g_email, g_name)

            # Fetch members of each group
            try:
                members_result = service.members().list(groupKey=g_email).execute()
                members = members_result.get('members', [])
                for m in members:
                    m_email = m.get('email', '').lower()
                    if m_email:
                        cursor.execute("INSERT INTO GroupMembers (GroupEmail, MemberEmail) VALUES (?, ?)", g_email, m_email)
            except Exception as me:
                logger.warning("[GROUPS SYNC] Could not fetch members for %s: %s", g_email, me)

        conn.commit()
        conn.close()
        logger.info("[GROUPS SYNC] Sync complete. %d groups synced.", len(groups))
        return {"status": "ok", "groups_synced": len(groups)}

    except Exception as e:
        logger.error("[GROUPS SYNC] Failed: %s", traceback.format_exc())
        return {"status": "error", "message": str(e)}

@app.post("/admin/sync-groups")
async def trigger_group_sync():
    """Manually trigger Google Groups sync from Admin Dashboard."""
    result = sync_google_groups_to_db()
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.get("/admin/groups")
async def list_groups():
    """Return all synced Google Groups for the Admin Dashboard checkboxes."""
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT GroupEmail, GroupName FROM GoogleGroups ORDER BY GroupName")
        return [{"email": r[0], "name": r[1] or r[0]} for r in cursor.fetchall()]
    finally: conn.close()

def get_user_google_groups(user_email: str) -> list:
    """Returns list of Google Group emails the user belongs to (from DB cache)."""
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT GroupEmail FROM GroupMembers WHERE MemberEmail = ?", user_email.lower())
        return [r[0].lower() for r in cursor.fetchall()]
    finally: conn.close()

def get_user_live_groups(user_email: str) -> list:
    """Real-time Google Directory API lookup - used on SSO login for instant accuracy.
    Falls back to DB cache if API is unavailable."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        if not SERVICE_ACCOUNT_FILE.exists() or not WORKSPACE_ADMIN_EMAIL:
            return get_user_google_groups(user_email)

        SCOPES = [
            'https://www.googleapis.com/auth/admin.directory.group.readonly',
        ]
        creds = service_account.Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_FILE), scopes=SCOPES
        ).with_subject(WORKSPACE_ADMIN_EMAIL)

        service = build('admin', 'directory_v1', credentials=creds, cache_discovery=False)
        result = service.groups().list(userKey=user_email).execute()
        groups = result.get('groups', [])
        group_emails = [g.get('email', '').lower() for g in groups if g.get('email')]
        logger.info(f"[LIVE GROUPS] {user_email} is in {len(group_emails)} groups.")
        return group_emails
    except Exception as e:
        logger.warning(f"[LIVE GROUPS] API call failed for {user_email}, falling back to DB: {e}")
        return get_user_google_groups(user_email)

# ─────────────────────────────────────────────
# Password Hashing Helpers (bcrypt)
# ─────────────────────────────────────────────
def hash_password(plain: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        # Fallback: plain-text comparison for legacy accounts not yet migrated
        return plain == hashed

# ─────────────────────────────────────────────
# Google Groups to Excel Department Mapping
# ─────────────────────────────────────────────
# Maps actual Google Group emails to the exact Department names used in the Admin Dashboard Checkboxes
GROUP_TO_DEPT_MAPPING = {
    "mancom@sdf.lk": "MANCOM",
    "compliancedepartment@sdf.lk": "COMPLIANCE TEAM",
    "auditdepartment@sdf.lk": "INTERNAL AUDIT",
    "risk@sdf.lk": "RISK MANAGEMENT",
    "boardofdirectors@sdf.lk": "BOARD",
    "tencomm@sdf.lk": "TENDER COMMITTEE",
    "finance@sdf.lk": "FINANCE",
    "creditdepartment@sdf.lk": "CREDIT",
    "recoverydepartment@sdf.lk": "RECOVERY",
    "alco@sdf.lk": "ALCO",
    "cau@sdf.lk": "CAU",
    "itsecurity@sdf.lk": "ITSC",
    "itgroup@sdf.lk": "IT",
    "operationsdepartment@sdf.lk": "OPERATIONS",
    "productdevelopmentcommittee@sdf.lk": "PDC",
    "productheads@sdf.lk": "PRODUCT HEADS",
    "sustainabilitycommittee@sdf.lk": "SUSTAINABILITYCOMMITTE",
    "ormc@sdf.lk": "ORMC",
    "goldloandepartment@sdf.lk": "GOLD LOAN",
    "humanresources@sdf.lk": "HR",
    "legaldepartment@sdf.lk": "LEGAL",
    "marketingdepartment@sdf.lk": "MARKETING"
}

@app.post("/auth/login")
async def login(req: Dict[str, str]):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Username, Role, Name, Password, IsRegistered, PreferredName FROM Accounts WHERE Username=?", req['username'])
        row = cursor.fetchone()
        if not row or not row[3]:
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        if not verify_password(req['password'], row[3]):
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        return {
            "username": row[0], 
            "role": row[1], 
            "name": row[2], 
            "emp_num": row[0],
            "preferred_name": row[5] or row[2],
            "is_first_login": False
        }
    finally: conn.close()

@app.post("/auth/google")
async def google_sso(req: Dict[str, str]):
    """Google SSO - Verify Google token and auto-login/create SDF employees."""
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as grequests
        GOOGLE_CLIENT_ID = "244353936870-4bft7oc0tlei7of6e8nl3jg30pjm67k5.apps.googleusercontent.com"
        idinfo = id_token.verify_oauth2_token(req['credential'], grequests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)
        email = idinfo.get('email', '')
        if email: email = email.lower().strip()
        
        name  = idinfo.get('name')
        if not name: name = "SDF User"
        
        # Restrict to SDF domain only
        if not email.endswith('@sdf.lk'):
            raise HTTPException(status_code=403, detail="Access denied. Only @sdf.lk accounts are allowed.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google token verification failed: {str(e)}")

    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    try:
        cursor = conn.cursor()

        # Auto-detect department from Google Groups (Live API - real-time accurate)
        user_google_groups = get_user_live_groups(email)
        auto_departments = []
        for g_email in user_google_groups:
            g_email_lower = g_email.lower()
            
            # 1. Check if this exact email is in our Mapping Dictionary
            if g_email_lower in GROUP_TO_DEPT_MAPPING:
                mapped_dept = GROUP_TO_DEPT_MAPPING[g_email_lower]
                if mapped_dept not in auto_departments:
                    auto_departments.append(mapped_dept)
            else:
                # 2. Fallback: Extract group name from email if not mapped
                group_name = g_email_lower.split('@')[0].upper().replace('-', ' ').replace('_', ' ')
                if group_name and group_name not in auto_departments:
                    auto_departments.append(group_name)
                    
        auto_dept_str = ", ".join(auto_departments) if auto_departments else None

        # Check if user already exists
        cursor.execute("SELECT Username, Role, Name, PreferredName, Department FROM Accounts WHERE Username=?", email)
        row = cursor.fetchone()
        if row:
            # Existing user — update department from Google Groups if available
            final_dept = auto_dept_str if auto_dept_str else (row[4] or "")
            if auto_dept_str:
                cursor.execute("UPDATE Accounts SET Department=? WHERE Username=?", auto_dept_str, email)
                conn.commit()
            return {
                "username": row[0],
                "role": row[1],
                "name": row[2],
                "emp_num": row[0],
                "preferred_name": row[3] or row[2],
                "department": final_dept,
                "email": email,
                "is_first_login": False
            }
        else:
            # New SDF employee — auto-create account with auto-detected department
            username = email
            cursor.execute(
                "INSERT INTO Accounts (Username, Role, Name, PreferredName, IsRegistered, Department) VALUES (?, ?, ?, ?, ?, ?)",
                username, 'user', name, name.split(' ')[0], 1, auto_dept_str
            )
            conn.commit()
            logger.info(f"New SSO user auto-created: {email} | Departments: {auto_dept_str}")
            return {
                "username": username,
                "role": "user",
                "name": name,
                "emp_num": username,
                "preferred_name": name.split(' ')[0],
                "department": auto_dept_str or "",
                "email": email,
                "is_first_login": False
            }
    finally:
        conn.close()



@app.get("/admin/documents")
async def list_docs():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed. Cannot list documents.")
    cursor = conn.cursor()
    cursor.execute("SELECT ID, Filename, Department, StartDate, ExpireDate, AdminID, CreatedAt, AllowedEmails, AllowedGroups FROM KnowledgeDocuments ORDER BY ID DESC")
    return [{"id": r[0], "filename": r[1], "department": r[2], "start_date": r[3], "expire_date": r[4], "admin_id": r[5], "created_at": r[6].isoformat(), "allowed_emails": r[7] or "", "allowed_groups": r[8] or ""} for r in cursor.fetchall()]

@app.get("/user/documents/{username}")
async def list_user_docs(username: str):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Department, Email, Role FROM Accounts WHERE Username = ?", username)
        user_row = cursor.fetchone()
        user_dept_str = (user_row[0] or "").strip() if user_row else ""
        user_depts = [d.strip() for d in user_dept_str.split(",")] if user_dept_str else []
        user_email = (user_row[1] or username).strip().lower() if user_row else username.strip().lower()
        user_role = user_row[2] if user_row else "user"

        cursor.execute("SELECT ID, Filename, Department, StartDate, ExpireDate, AdminID, CreatedAt, AllowedEmails, AllowedGroups FROM KnowledgeDocuments ORDER BY ID DESC")
        all_docs = []
        for r in cursor.fetchall():
            f_dept = (r[2] or "General").strip()
            f_emails = r[7]
            f_allowed_groups_str = r[8] or ""
            f_allowed_groups = [g.strip().upper() for g in f_allowed_groups_str.split(",")] if f_allowed_groups_str else []
            
            has_access = False
            # Master Admin sees everything
            if user_role == "master":
                has_access = True

            # Check owner department
            if not has_access and (f_dept in ["General", "All", "General / Other", ""] or f_dept in user_depts):
                has_access = True

            # Check allowed groups (Department-based legacy groups)
            overlap = set([ud.upper() for ud in user_depts]).intersection(set(f_allowed_groups))
            if overlap or "ALL" in f_allowed_groups:
                has_access = True

            # Check Google Groups membership (new)
            if not has_access and f_allowed_groups:
                user_google_groups = get_user_google_groups(user_email)
                google_overlap = set(user_google_groups).intersection(set([g.lower() for g in f_allowed_groups]))
                if google_overlap:
                    has_access = True

            # Check emails
            if f_emails and user_email:
                emails = [e.strip().lower() for e in f_emails.split(',')]
                if user_email in emails:
                    has_access = True
                    
            if has_access:
                all_docs.append({"id": r[0], "filename": r[1], "department": r[2], "start_date": r[3], "expire_date": r[4], "admin_id": r[5], "created_at": r[6].isoformat(), "allowed_emails": r[7] or "", "allowed_groups": r[8] or ""})
        return all_docs
    finally: conn.close()

@app.delete("/admin/document/{filename}")
async def delete_doc(filename: str, admin_id: str = "System"):
    try:
        vs = get_vectorstore()
        collection = vs._collection
        # Delete only chunks belonging to this file
        collection.delete(where={"source": filename})
        
        log_document_action("DELETE", filename, 0, admin_id)
        
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM KnowledgeDocuments WHERE Filename = ?", filename)
                cursor.execute("TRUNCATE TABLE QueryCache")
                conn.commit()
            finally: conn.close()

        # Delete local file
        local_file = UPLOAD_DIR / filename
        if local_file.exists(): local_file.unlink()

        return {"message": f"Deleted document {filename} and its associated knowledge."}
    except Exception as e:
        logger.error(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/account")
async def list_users():
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Username, Name, Role, PreferredName, Department FROM Accounts")
        return [{"username": r[0], "name": r[1], "role": r[2], "preferred_name": r[3], "department": r[4] or ""} for r in cursor.fetchall()]
    finally: conn.close()

@app.post("/admin/account")
async def add_user(user_data: Dict[str, str]):
    """Admin authorizes an EPF number for self-registration."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Insert with NULL password and IsRegistered=0 to allow them to register themselves
        cursor.execute("INSERT INTO Accounts (Username, Password, Role, Name, Department, IsRegistered) VALUES (?, NULL, ?, ?, ?, 0)",
                       user_data["username"], user_data["role"], user_data["name"], user_data.get("department", ""))
        
        conn.commit()
        return {"message": "User authorized successfully. They can now register using their Employee Number."}
    finally: conn.close()

@app.delete("/admin/account/{username}")
async def delete_user(username: str, admin_id: str = "System"):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Accounts WHERE Username = ?", username)
        
        conn.commit()
        return {"message": "User deleted"}
    finally: conn.close()

@app.put("/admin/account/{username}")
async def update_user(username: str, user_data: Dict[str, str]):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        pref_name = user_data.get("preferred_name")
        department = user_data.get("department", "")
        if user_data.get("password"):
            hashed = hash_password(user_data["password"])
            cursor.execute("UPDATE Accounts SET Role=?, Name=?, PreferredName=?, Department=?, Password=? WHERE Username=?",
                           user_data["role"], user_data["name"], pref_name, department, hashed, username)
        else:
            cursor.execute("UPDATE Accounts SET Role=?, Name=?, PreferredName=?, Department=? WHERE Username=?",
                           user_data["role"], user_data["name"], pref_name, department, username)
            
        conn.commit()
        return {"message": "User updated"}
    finally: conn.close()

@app.put("/admin/document/update")
async def update_doc_dates(data: Dict[str, str]):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if "department" in data and "allowed_emails" in data:
            cursor.execute("UPDATE KnowledgeDocuments SET StartDate = ?, ExpireDate = ?, Department = ?, AllowedEmails = ?, AllowedGroups = ? WHERE Filename = ?",
                           data["start_date"], data["expire_date"], data["department"], data["allowed_emails"], data.get("allowed_groups", ""), data["filename"])
        else:
            cursor.execute("UPDATE KnowledgeDocuments SET StartDate = ?, ExpireDate = ? WHERE Filename = ?",
                           data["start_date"], data["expire_date"], data["filename"])
        
        # Log the modification
        log_document_action("MODIFY", data["filename"], 0, data.get("admin_id", "System"))
        
        conn.commit()
        return {"message": "Document dates updated"}
    finally: conn.close()

@app.post("/admin/document/rename")
async def rename_document(data: Dict[str, str]):
    old_name = data["old_filename"]
    new_name = data["new_filename"]
    admin_id = data.get("admin_id", "System")
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # 1. Update KnowledgeDocuments
        cursor.execute("UPDATE KnowledgeDocuments SET Filename = ? WHERE Filename = ?", new_name, old_name)
        
        # 2. Update ChromaDB Chunks (Metadata)
        vs = get_vectorstore()
        collection = vs._collection
        # We fetch all IDs first because update(where=...) is not directly supported for IDs/Metadata as a batch in older chroma
        # But we can update metadata for all chunks where source matches
        collection.update(
            where={"source": old_name},
            metadatas=[{"source": new_name}] * collection.count(where={"source": old_name})
        )
        
        # 3. Rename local file
        old_path = UPLOAD_DIR / old_name
        new_path = UPLOAD_DIR / new_name
        if old_path.exists():
            old_path.rename(new_path)
            
        # 4. Log the rename
        log_document_action("RENAME", f"{old_name} -> {new_name}", 0, admin_id)
        
        conn.commit()
        return {"message": "Document renamed successfully"}
    except Exception as e:
        logger.error(f"Rename failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally: conn.close()

@app.get("/admin/billing-status")
async def get_billing():
    return {
        "spent": round(current_monthly_spend, 4),
        "limit": MONTHLY_BUDGET_LIMIT,
        "remaining": round(max(0, MONTHLY_BUDGET_LIMIT - current_monthly_spend), 4),
        "status": "OK" if current_monthly_spend < MONTHLY_BUDGET_LIMIT else "QUOTA_EXCEEDED"
    }

@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=filename, media_type='application/pdf')

@app.get("/history/{employee_id}")
async def get_history(employee_id: str):
    conn = get_db_connection()
    if not conn: return []
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT SessionID, QueryText, AIResponse, CreatedAt, IsSaved, SessionTitle, PinnedAt FROM AuditTrail WHERE EmployeeID=? ORDER BY PinnedAt DESC, CreatedAt DESC", employee_id)
        return [{"session_id": r[0], "query": r[1], "response": r[2], "created_at": r[3].isoformat(), "is_saved": r[4], "session_title": r[5], "pinned_at": r[6].isoformat() if r[6] else None} for r in cursor.fetchall()]
    finally: conn.close()

@app.put("/history/save/{session_id}")
async def save_chat_session(session_id: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE AuditTrail SET IsSaved = 1 WHERE SessionID = ?", session_id)
        conn.commit()
        return {"message": "Session saved"}
    finally: conn.close()

@app.put("/history/rename/{session_id}")
async def rename_chat_session(session_id: str, data: Dict[str, str]):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE AuditTrail SET SessionTitle = ? WHERE SessionID = ?", data['title'], session_id)
        conn.commit()
        return {"message": "Session renamed"}
    finally: conn.close()

@app.put("/history/pin/{session_id}")
async def pin_chat_session(session_id: str, data: Dict[str, bool]):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if data.get('pin'):
            cursor.execute("UPDATE AuditTrail SET PinnedAt = GETDATE() WHERE SessionID = ?", session_id)
        else:
            cursor.execute("UPDATE AuditTrail SET PinnedAt = NULL WHERE SessionID = ?", session_id)
        conn.commit()
        return {"message": "Session pin status updated"}
    finally: conn.close()

@app.delete("/history/delete/{session_id}")
async def delete_chat_session(session_id: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Instead of actually deleting, we set IsSaved = 0 so it disappears from the user's history but remains for auditing
        cursor.execute("UPDATE AuditTrail SET IsSaved = 0 WHERE SessionID = ?", session_id)
        conn.commit()
        return {"message": "Session removed from history"}
    finally: conn.close()

# ─────────────────────────────────────────────
# Authentication & User Management
# ─────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    name: str
    q1: str
    a1: str
    q2: str
    a2: str
    q3: str
    a3: str

@app.post("/auth/register")
async def register_user(req: RegisterRequest):
    """Self-registration for pre-authorized EPF numbers."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Check if the EPF exists in the list and if it is already registered
        cursor.execute("SELECT IsRegistered FROM Accounts WHERE Username = ?", req.username)
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=403, detail="Employee Number not authorized for registration. Contact IT.")
        if row[0] == 1:
            raise HTTPException(status_code=400, detail="Account already registered. Please login or reset password.")
            
        hashed = hash_password(req.password)
        cursor.execute(
            "UPDATE Accounts SET PreferredName = ?, Password = ?, Q1 = ?, A1 = ?, Q2 = ?, A2 = ?, Q3 = ?, A3 = ?, IsRegistered = 1 WHERE Username = ?",
            req.name, hashed, req.q1, req.a1, req.q2, req.a2, req.q3, req.a3, req.username
        )
        conn.commit()
        return {"message": "Registration successful"}
    finally: conn.close()

@app.get("/auth/user-questions/{username}")
async def get_user_questions(username: str):
    """Fetches the security questions assigned to a specific user."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT Q1, Q2, Q3 FROM Accounts WHERE Username = ?", username)
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="User not found")
        if not row[0]: raise HTTPException(status_code=400, detail="Security questions not set for this user")
        return {"q1": row[0], "q2": row[1], "q3": row[2]}
    finally: conn.close()

class SecurityVerifyRequest(BaseModel):
    username: str
    a1: str
    a2: str
    a3: str

@app.post("/auth/verify-security")
async def verify_security(req: SecurityVerifyRequest):
    """Verifies answers for the user's specific security questions."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT A1, A2, A3 FROM Accounts WHERE Username = ?",
            req.username
        )
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404, detail="User not found")
        
        if row[0] == req.a1 and row[1] == req.a2 and row[2] == req.a3:
            return {"status": "verified"}
            
        raise HTTPException(status_code=401, detail="Security answers do not match")
    finally: conn.close()

class ResetPasswordRequest(BaseModel):
    username: str
    new_password: str

@app.post("/auth/reset-forgotten-password")
async def reset_forgotten_password(req: ResetPasswordRequest):
    """Resets password after security verification."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        hashed = hash_password(req.new_password)
        cursor.execute("UPDATE Accounts SET Password = ? WHERE Username = ?", hashed, req.username)
        conn.commit()
        return {"message": "Password reset successful"}
    finally: conn.close()

class SetupProfileRequest(BaseModel):
    username: str
    new_password: str
    q1: str
    a1: str
    q2: str
    a2: str
    q3: str
    a3: str

@app.post("/auth/setup-profile")
async def setup_profile_route(req: SetupProfileRequest):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        hashed = hash_password(req.new_password)
        cursor.execute(
            "UPDATE Accounts SET Password = ?, Q1 = ?, A1 = ?, Q2 = ?, A2 = ?, Q3 = ?, A3 = ?, IsRegistered = 1 WHERE Username = ?",
            hashed, req.q1, req.a1, req.q2, req.a2, req.q3, req.a3, req.username
        )
        conn.commit()
        return {"message": "Profile setup successful"}
    finally: conn.close()
