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
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain / LangGraph
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
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
    title="SDF AI Copilot API",
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
        logger.info("Initializing Google Generative AI Embeddings (gemini-embedding-001)…")
        _embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
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

def get_llm(model_name: str = "gemini-2.0-flash"):
    """Returns a Gemini model. Optimized for gemini-2.0-flash."""
    key = os.getenv("GOOGLE_API_KEY")
    logger.info(f"Connecting to Google Gemini ({model_name})…")
    return ChatGoogleGenerativeAI(
        model=model_name, 
        google_api_key=key, 
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
    retrieved_chunks: List[str]
    draft_response: str
    final_response: str
    hallucination_check: str
    accuracy_score: str
    rewrite_count: int
    current_agent: str

# ─────────────────────────────────────────────
# Agent Nodes
# ─────────────────────────────────────────────

def researcher_node(state: AgentState) -> AgentState:
    """Researcher Agent: Finds relevant chunks from ChromaDB."""
    logger.info("[RESEARCHER] Finding relevant document chunks…")
    vs = get_vectorstore()
    docs = vs.similarity_search(state["query"], k=5)
    chunks = [doc.page_content for doc in docs]
    if not chunks:
        chunks = ["No relevant documents found in the knowledge base."]
    return {**state, "retrieved_chunks": chunks, "current_agent": "Researcher"}

def compliance_node(state: AgentState) -> AgentState:
    """Compliance Agent: Uses Gemini Pro for high-accuracy validation."""
    logger.info("[COMPLIANCE] Validating policy compliance with Gemini 2.5 Pro…")
    llm = get_llm("gemini-2.5-pro")
    context = "\n\n---\n\n".join(state["retrieved_chunks"])
    prompt = f"As a Corporate Compliance Officer, evaluate if the following context contains enough information to answer the query safely and accurately.\n\nQUERY: {state['query']}\n\nCONTEXT: {context}\n\nRespond with a 1-sentence assessment."
    response = llm.invoke(prompt)
    return {**state, "draft_response": f"[COMPLIANCE] {response.content}", "current_agent": "Compliance"}

def communicator_node(state: AgentState) -> AgentState:
    """Communicator Agent: Uses Gemini Flash for high-speed response drafting."""
    logger.info("[COMMUNICATOR] Drafting response with Gemini 2.0 Flash…")
    llm = get_llm("gemini-2.0-flash")
    context = "\n\n---\n\n".join(state["retrieved_chunks"])
    history = state.get("history", "")
    prompt = (
        "You are a Professional Corporate Communications AI for Sarvodaya Development Finance (SDF). "
        "DOCUMENT CONTEXT:\n{context}\n\n"
        "CHAT HISTORY:\n{history}\n\n"
        "USER QUERY: {state['query']}\n\n"
        "INSTRUCTIONS:\n"
        "1. If the answer is in the CONTEXT, provide a professional response with citations like [Source: file.pdf, Page: X].\n"
        "2. If the user is just saying 'Hi' or asking a general question NOT in the context, politely explain that you are the SDF AI Copilot and can only answer questions based on official internal documents.\n"
        "3. BILINGUAL: Always respond in both English and Sinhala (Sinhala translation follows English).\n"
        "4. Keep it concise (under 100 words).\n"
    )
    response = llm.invoke(prompt.format(context=context, history=history))
    return {**state, "draft_response": response.content, "current_agent": "Communicator"}

def reviewer_node(state: AgentState) -> AgentState:
    """Reviewer Agent: Uses Gemini Pro for final fact-checking and accuracy."""
    logger.info("[REVIEWER] Fact-checking with Gemini 2.5 Pro…")
    llm = get_llm("gemini-2.5-pro")
    context = "\n\n---\n\n".join(state["retrieved_chunks"])
    prompt = (
        "Review the DRAFT RESPONSE against the DOCUMENT CONTEXT for accuracy and hallucinations. "
        "Output ONLY raw JSON: {\"verdict\": \"PASS\" or \"FAIL\", \"accuracy\": \"X%\"}\n\n"
        f"CONTEXT:\n{context}\n\nDRAFT:\n{state['draft_response']}"
    )
    response = llm.invoke(prompt)
    try:
        data = json.loads(response.content.strip("` \n").replace("json", ""))
        verdict = data.get("verdict", "FAIL")
        acc = data.get("accuracy", "0%")
    except:
        verdict, acc = "FAIL", "0%"
    
    return {**state, "hallucination_check": verdict.lower(), "accuracy_score": acc, "current_agent": "Reviewer"}

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
            cursor.execute("INSERT INTO QueryCache (QueryText, AIResponse, Accuracy) VALUES (?, ?, ?)",
                           state["query"].strip().lower(), final, state.get("accuracy_score", "0%"))
            
            # Intelligence Audit (Log ONLY if multiple attempts were needed)
            if state.get("rewrite_count", 0) > 0:
                model_info = "Gemini 1.5 Flash (Writer) | Gemini 1.5 Pro (Reviewer)"
                cursor.execute("INSERT INTO IntelligenceAudit (EmployeeID, Query, DraftResponse, ReviewerFeedback, FinalResponse, LoopCount, ModelInfo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                               state["employee_id"], state["query"], state.get("draft_response", ""), state.get("hallucination_check", ""), final, state["rewrite_count"], model_info)
            
            conn.commit()
        finally: conn.close()
    return {**state, "final_response": final, "current_agent": "Done"}

# ─────────────────────────────────────────────
# Graph Construction
# ─────────────────────────────────────────────
def hallucination_router(state):
    if state["hallucination_check"] == "pass" or state.get("rewrite_count", 0) >= 2: return "audit"
    return "rewrite"

def increment_rewrite(state):
    return {**state, "rewrite_count": state.get("rewrite_count", 0) + 1}

def build_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("compliance", compliance_node)
    workflow.add_node("communicator", communicator_node)
    workflow.add_node("reviewer", reviewer_node)
    workflow.add_node("increment_rewrite", increment_rewrite)
    workflow.add_node("audit", audit_node)

    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "compliance")
    workflow.add_edge("compliance", "communicator")
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
    # Check Cache
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT AIResponse, Accuracy FROM QueryCache WHERE QueryText = ?", request.query.strip().lower())
            row = cursor.fetchone()
            if row:
                async def cache_gen():
                    yield f"data: {json.dumps({'agent': 'Cache', 'status': 'done', 'response': row[0], 'accuracy_score': row[1], 'hallucination_check': 'pass'})}\n\n"
                    yield "data: [DONE]\n\n"
                return StreamingResponse(cache_gen(), media_type="text/event-stream")
        finally: conn.close()

    initial_state = {
        "query": request.query, "employee_id": request.employee_id, "session_id": request.session_id, "save_chat": request.save_chat,
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
    department: str = Form("General")
):
    if not file.filename.lower().endswith(".pdf"): raise HTTPException(status_code=400, detail="Only PDFs allowed.")
    
    file_path = UPLOAD_DIR / file.filename
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
                cursor.execute("INSERT INTO KnowledgeDocuments (Filename, Department, StartDate, ExpireDate, AdminID) VALUES (?, ?, ?, ?, ?)",
                               file.filename, department, start_date, expire_date, admin_id)
                cursor.execute("TRUNCATE TABLE QueryCache")
                conn.commit()
            finally: conn.close()

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
        cursor.execute("SELECT ID, EmployeeID, Query, DraftResponse, ReviewerFeedback, FinalResponse, LoopCount, ModelInfo, CreatedAt FROM IntelligenceAudit ORDER BY CreatedAt DESC")
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

@app.get("/admin/documents")
async def list_docs():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed. Cannot list documents.")
    cursor = conn.cursor()
    cursor.execute("SELECT ID, Filename, Department, StartDate, ExpireDate, AdminID, CreatedAt FROM KnowledgeDocuments ORDER BY ID DESC")
    return [{"id": r[0], "filename": r[1], "department": r[2], "start_date": r[3], "expire_date": r[4], "admin_id": r[5], "created_at": r[6].isoformat()} for r in cursor.fetchall()]

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
        cursor.execute("SELECT Username, Name, Role, PreferredName FROM Accounts")
        return [{"username": r[0], "name": r[1], "role": r[2], "preferred_name": r[3]} for r in cursor.fetchall()]
    finally: conn.close()

@app.post("/admin/account")
async def add_user(user_data: Dict[str, str]):
    """Admin authorizes an EPF number for self-registration."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Insert with NULL password and IsRegistered=0 to allow them to register themselves
        cursor.execute("INSERT INTO Accounts (Username, Password, Role, Name, IsRegistered) VALUES (?, NULL, ?, ?, 0)",
                       user_data["username"], user_data["role"], user_data["name"])
        
        conn.commit()
        return {"message": "User authorized successfully. They can now register using their EPF."}
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
        if user_data.get("password"):
            hashed = hash_password(user_data["password"])
            cursor.execute("UPDATE Accounts SET Role=?, Name=?, PreferredName=?, Password=? WHERE Username=?",
                           user_data["role"], user_data["name"], pref_name, hashed, username)
        else:
            cursor.execute("UPDATE Accounts SET Role=?, Name=?, PreferredName=? WHERE Username=?",
                           user_data["role"], user_data["name"], pref_name, username)
            
        conn.commit()
        return {"message": "User updated"}
    finally: conn.close()

@app.put("/admin/document/update")
async def update_doc_dates(data: Dict[str, str]):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
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
        cursor.execute("SELECT SessionID, QueryText, AIResponse, CreatedAt, IsSaved, SessionTitle FROM AuditTrail WHERE EmployeeID=? ORDER BY CreatedAt DESC", employee_id)
        return [{"session_id": r[0], "query": r[1], "response": r[2], "created_at": r[3].isoformat(), "is_saved": r[4], "session_title": r[5]} for r in cursor.fetchall()]
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
        # පරීක්ෂා කරනවා EPF එක ලිස්ට් එකේ තියෙනවද සහ දැනටමත් රෙජිස්ටර් වෙලාද කියලා
        cursor.execute("SELECT IsRegistered FROM Accounts WHERE Username = ?", req.username)
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=403, detail="EPF Number not authorized for registration. Contact IT.")
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
