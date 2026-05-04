# SDF AI Copilot

> **100% Local · Zero-Cost · Enterprise Multi-Agent RAG System**
> Powered by Ollama (llama3) · ChromaDB · LangGraph · FastAPI · React + Tailwind

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Prerequisites & Installation](#4-prerequisites--installation)
   - 4.1 [System Requirements](#41-system-requirements)
   - 4.2 [Install Ollama + llama3](#42-install-ollama--llama3)
   - 4.3 [Set Up SQL Server Express](#43-set-up-sql-server-express)
   - 4.4 [Backend Setup (Python)](#44-backend-setup-python)
   - 4.5 [Frontend Setup (React)](#45-frontend-setup-react)
5. [Database Schema](#5-database-schema)
6. [Running the Application](#6-running-the-application)
7. [Full API Reference](#7-full-api-reference)
8. [LangGraph Multi-Agent Pipeline](#8-langgraph-multi-agent-pipeline)
9. [Frontend Features](#9-frontend-features)
10. [User Roles & Permissions](#10-user-roles--permissions)
11. [Configuration & Environment](#11-configuration--environment)
12. [Utility Scripts](#12-utility-scripts)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Overview

**SDF AI Copilot** is a fully self-hosted, enterprise-grade AI assistant that lets employees query internal company policy documents through a conversational interface. It runs entirely on your local machine — no cloud, no paid API keys, no data leaving your network.

### Key Highlights

| Feature | Detail |
|---|---|
| **LLM** | Ollama running `llama3` locally |
| **Embeddings** | HuggingFace `all-MiniLM-L6-v2` (CPU, downloaded once) |
| **Vector Store** | ChromaDB (persistent local directory) |
| **PDF Parsing** | PyMuPDF (fast, no dependencies on cloud OCR) |
| **Orchestration** | LangGraph `StateGraph` — 5-node multi-agent pipeline |
| **Audit Trail** | MSSQL (SQL Server Express) |
| **API** | FastAPI with SSE streaming responses |
| **Frontend** | React 19 + Vite + TailwindCSS |
| **Cost** | $0.00 — 100% local |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  (Vite + TailwindCSS · Port 5173)                       │
│                                                         │
│  ┌─────────────┐   ┌──────────────────────────────┐    │
│  │  Login View │   │  Chat View (SSE Streaming)   │    │
│  └─────────────┘   │  • History Sidebar           │    │
│  ┌──────────────┐  │  • Library (Document Links)  │    │
│  │Admin Dashboard│  │  • Agent Pipeline Progress  │    │
│  │• Upload PDF   │  └──────────────────────────────┘   │
│  │• Manage Docs  │                                     │
│  │• Manage Users │                                     │
│  │• Action Logs  │                                     │
│  └──────────────┘                                       │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE  (axios + fetch)
                         ▼
┌─────────────────────────────────────────────────────────┐
│               FastAPI Backend  (Port 8000)              │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              LangGraph Pipeline                   │  │
│  │                                                   │  │
│  │  [Researcher] ──► [Compliance] ──► [Communicator] │  │
│  │                                         │         │  │
│  │                                    [Reviewer]     │  │
│  │                                    /        \     │  │
│  │                              (PASS)        (FAIL) │  │
│  │                                 │        [Rewrite]│  │
│  │                                 │             │   │  │
│  │                             [Audit Node] ◄───┘   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────┐   ┌──────────────┐   ┌───────────┐  │
│  │  ChromaDB     │   │  Ollama LLM  │   │  MSSQL    │  │
│  │  (chroma_db/) │   │  (llama3)    │   │  Audit DB │  │
│  └───────────────┘   └──────────────┘   └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow (Chat Request)

```
User sends query
     │
     ▼
FastAPI /chat/stream
     │
     ├─ Checks QueryCache (MSSQL) for exact match → returns instantly if found
     │
     └─ Runs LangGraph pipeline:
          1. RESEARCHER  → embeds query, retrieves top-3 chunks from ChromaDB
          2. COMPLIANCE  → Ollama analyzes if context is sufficient
          3. COMMUNICATOR → Ollama drafts professional response with citations
          4. REVIEWER    → Ollama verifies no hallucinations (JSON verdict)
               ├─ PASS  → AUDIT node (saves to MSSQL, caches result)
               └─ FAIL  → rewrite (up to 2 retries) → AUDIT node
          5. AUDIT       → Saves EmployeeID, Query, Response to AuditTrail
     │
     └─ Streams SSE events to frontend (agent progress + final response)
```

---

## 3. Project Structure

```
Local_Agent/
│
├── backend/                        # Python FastAPI backend
│   ├── main.py                     # All routes, LangGraph pipeline, agents
│   ├── requirements.txt            # Python dependencies
│   ├── setup_db.sql                # MSSQL schema creation script
│   ├── reset_kb.py                 # Utility: wipe ChromaDB + SQL data
│   ├── .env.example                # Environment variable template
│   ├── chroma_db/                  # ChromaDB persistent vector store (auto-created)
│   └── uploads/                    # Uploaded PDF files (auto-created)
│
├── frontend/                       # React + Vite frontend
│   ├── index.html                  # HTML entry point
│   ├── package.json                # Node dependencies
│   ├── vite.config.js              # Vite configuration
│   ├── tailwind.config.js          # Tailwind custom theme (brand + dark colors)
│   ├── postcss.config.js           # PostCSS setup
│   └── src/
│       ├── main.jsx                # React entry point
│       ├── App.jsx                 # Root component (Login, routing, theme)
│       ├── App.css                 # Minimal app-level styles
│       ├── index.css               # Global styles, Tailwind directives, animations
│       ├── api.js                  # Axios API client (all endpoints)
│       └── components/
│           ├── Sidebar.jsx         # Left navigation sidebar
│           ├── ChatView.jsx        # Chat interface with SSE streaming
│           ├── AdminDashboard.jsx  # Document management & user admin
│           └── MessageBubble.jsx   # Individual message component
│
└── README.md                       # This file
```

---

## 4. Prerequisites & Installation

### 4.1 System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10/11 | Windows 11 |
| **RAM** | 8 GB | 16 GB |
| **Disk** | 10 GB free | 20 GB free |
| **Python** | 3.11 | 3.11 or 3.12 |
| **Node.js** | 18 LTS | 20 LTS |
| **SQL Server** | Express 2019 | Express 2022 |
| **ODBC Driver** | 17 | 17 or 18 |

---

### 4.2 Install Ollama + llama3

Ollama runs the LLM locally. You only need to do this once.

**Step 1 – Download and install Ollama:**
```
https://ollama.com/download/windows
```

**Step 2 – Pull the llama3 model** (run in any terminal):
```powershell
ollama pull llama3
```
> This downloads ~4.7 GB. Wait for it to finish.

**Step 3 – Verify Ollama is running:**
```powershell
ollama list
# Should show: llama3   latest   ...
```

Ollama starts automatically as a background service on Windows after installation. The API runs on `http://localhost:11434`.

---

### 4.3 Set Up SQL Server Express

**Step 1 – Install SQL Server Express** (if not already installed):
```
https://www.microsoft.com/en-us/sql-server/sql-server-downloads
```
Choose **Express** edition. During install, note your instance name (default: `SQLEXPRESS`).

**Step 2 – Install SQL Server Management Studio (SSMS)** (optional but recommended):
```
https://aka.ms/ssmsfullsetup
```

**Step 3 – Create the database and all tables** by running the setup script.

Option A — using SSMS:
1. Open SSMS, connect to `localhost\SQLEXPRESS`
2. File → Open → `backend\setup_db.sql`
3. Click **Execute (F5)**

Option B — using `sqlcmd` in PowerShell:
```powershell
sqlcmd -S localhost\SQLEXPRESS -i backend\setup_db.sql
```

**What the script creates:**

| Table | Purpose |
|---|---|
| `Accounts` | User/admin accounts with roles |
| `AuditTrail` | All employee queries + AI responses |
| `DocumentLogs` | Upload/delete/rename actions by admins |
| `KnowledgeDocuments` | Tracked uploaded documents with date ranges |
| `QueryCache` | Caches exact-match responses to speed repeat queries |

> A default **master admin** is created automatically:
> - Username: `master_admin`
> - Password: `admin123`
> ⚠️ **Change this password immediately after first login.**

**Step 4 – Install ODBC Driver 17 for SQL Server** (if not installed):
```
https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
```

**Step 5 – Enable Named Pipes and TCP/IP** (if connection fails):
1. Open **SQL Server Configuration Manager**
2. SQL Server Network Configuration → Protocols for SQLEXPRESS
3. Enable **Named Pipes** and **TCP/IP**
4. Restart the SQL Server service

---

### 4.4 Backend Setup (Python)

**Step 1 – Create and activate a virtual environment:**
```powershell
cd Local_Agent\backend
python -m venv venv
.\venv\Scripts\activate
```
> Your prompt should show `(venv)` at the start.

**Step 2 – Install all dependencies:**
```powershell
pip install -r requirements.txt
```
> The first run downloads ~1.5 GB (HuggingFace model + all packages). Subsequent starts are fast.

**Step 3 – (Optional) Create a `.env` file:**
```powershell
copy .env.example .env
```
Edit `.env` if you need to change the Ollama model, database name, or paths.

**Step 4 – Verify the backend starts:**
```powershell
python main.py
```
You should see:
```
INFO | SDF AI Copilot backend starting up…
INFO | Loading HuggingFace embeddings model (all-MiniLM-L6-v2)…
INFO | Initialising ChromaDB at ...\chroma_db…
INFO | Uvicorn running on http://127.0.0.1:8000
```

---

### 4.5 Frontend Setup (React)

**Step 1 – Install Node dependencies:**
```powershell
cd Local_Agent\frontend
npm install
```

**Step 2 – Start the development server:**
```powershell
npm run dev
```
The app opens at `http://localhost:5173`.

---

## 5. Database Schema

### `Accounts`
Stores all user credentials and role assignments.

```sql
CREATE TABLE Accounts (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    Username    NVARCHAR(100)   NOT NULL UNIQUE,
    Password    NVARCHAR(200)   NOT NULL,
    Role        NVARCHAR(50)    NOT NULL,   -- 'master' | 'admin' | 'subadmin' | 'user'
    Name        NVARCHAR(150)   NULL,
    EmpNum      NVARCHAR(100)   NULL,
    Designation NVARCHAR(150)   NULL,
    Department  NVARCHAR(150)   NULL,
    CreatedAt   DATETIME        DEFAULT GETDATE()
);
```

### `AuditTrail`
Every query and AI response is logged here for compliance.

```sql
CREATE TABLE AuditTrail (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeID  NVARCHAR(100)   NOT NULL,
    SessionID   NVARCHAR(100)   NULL,        -- Groups messages into sessions
    QueryText   NVARCHAR(MAX)   NOT NULL,
    AIResponse  NVARCHAR(MAX)   NOT NULL,
    IsSaved     BIT             DEFAULT 0,   -- User opted to save session
    IsPinned    BIT             DEFAULT 0,
    SessionTitle NVARCHAR(255)  NULL,        -- Custom session name
    CreatedAt   DATETIME        DEFAULT GETDATE()
);
```

### `DocumentLogs`
Tracks every admin action on documents.

```sql
CREATE TABLE DocumentLogs (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    AdminID     NVARCHAR(100)   NULL,
    Action      NVARCHAR(50)    NOT NULL,    -- 'UPLOAD' | 'DELETE' | 'RENAME' | 'MODIFY'
    Filename    NVARCHAR(255)   NOT NULL,
    ChunksCount INT             NOT NULL,
    CreatedAt   DATETIME        DEFAULT GETDATE()
);
```

### `KnowledgeDocuments`
Tracks documents with optional validity date ranges.

```sql
CREATE TABLE KnowledgeDocuments (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    Filename    NVARCHAR(255)   NOT NULL,
    StartDate   NVARCHAR(100)   NULL,        -- Policy effective from
    ExpireDate  NVARCHAR(100)   NULL,        -- Policy expires on
    AdminID     NVARCHAR(100)   NULL,
    CreatedAt   DATETIME        DEFAULT GETDATE()
);
```

### `QueryCache`
Exact-match cache to avoid re-running the expensive LLM pipeline.

```sql
CREATE TABLE QueryCache (
    ID          INT IDENTITY(1,1) PRIMARY KEY,
    QueryText   NVARCHAR(MAX)   NOT NULL,    -- Stored lowercase
    AIResponse  NVARCHAR(MAX)   NOT NULL,
    Accuracy    NVARCHAR(50)    NOT NULL,
    CreatedAt   DATETIME        DEFAULT GETDATE()
);
```

> **Note:** The cache is automatically cleared (`TRUNCATE TABLE QueryCache`) whenever a document is uploaded, deleted, or renamed.

---

## 6. Running the Application

Always start **both servers** at the same time in two separate terminals.

### Terminal 1 — Backend

```powershell
cd Local_Agent\backend
.\venv\Scripts\activate
python main.py
```

### Terminal 2 — Frontend

```powershell
cd Local_Agent\frontend
npm run dev
```

### Access the App

Open your browser and navigate to:
```
http://localhost:5173
```

Log in with the default master admin credentials:
- **Username:** `master_admin`
- **Password:** `admin123`

---

## 7. Full API Reference

Base URL: `http://127.0.0.1:8000`

Interactive API docs (Swagger UI): `http://127.0.0.1:8000/docs`

---

### System Endpoints

#### `GET /health`
Returns backend health status.

**Response:**
```json
{ "status": "ok" }
```

---

#### `POST /auth/login`
Authenticates a user and returns their profile.

**Request Body:**
```json
{
  "username": "master_admin",
  "password": "admin123"
}
```

**Response (200 OK):**
```json
{
  "username": "master_admin",
  "role": "master",
  "name": "Master Admin",
  "emp_num": "SYS-0000"
}
```

**Response (401 Unauthorized):**
```json
{ "detail": "Invalid username or password." }
```

---

### Chat Endpoints

#### `POST /chat/stream`
Runs the full LangGraph multi-agent pipeline and streams the response as Server-Sent Events (SSE).

**Request Body:**
```json
{
  "query": "What is the leave encashment policy?",
  "employee_id": "EMP-001",
  "session_id": "1712345678901",
  "save_chat": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | ✅ | The employee's question |
| `employee_id` | string | ✅ | Used for audit logging |
| `session_id` | string | ❌ | Groups messages into sessions |
| `save_chat` | boolean | ❌ | If `true`, session is persisted in history |

**SSE Stream Events:**

Each event is a `data:` line with a JSON payload:

```
data: {"agent": "Researcher", "status": "processing", "response": "", "accuracy_score": "", "hallucination_check": ""}

data: {"agent": "Compliance", "status": "processing", "response": "[COMPLIANCE NOTE]\nContext is sufficient...", "accuracy_score": "", "hallucination_check": ""}

data: {"agent": "Communicator", "status": "processing", "response": "Based on company policy...", "accuracy_score": "", "hallucination_check": ""}

data: {"agent": "Reviewer", "status": "processing", "response": "Based on company policy...", "accuracy_score": "92%", "hallucination_check": "pass"}

data: {"agent": "Done", "status": "processing", "response": "Based on company policy...", "accuracy_score": "92%", "hallucination_check": "pass"}

data: [DONE]
```

**Cache Hit Response** (when an identical query was previously answered):
```
data: {"agent": "CacheHit", "status": "done", "response": "...", "accuracy_score": "92%", "hallucination_check": "pass"}

data: [DONE]
```

---

#### `GET /history/{employee_id}`
Returns the saved chat history for a given employee.

**Example:** `GET /history/EMP-001`

**Response:**
```json
[
  {
    "id": 1,
    "session_id": "1712345678901",
    "query": "What is the leave policy?",
    "response": "Based on the HR Policy document...",
    "created_at": "2026-04-09T09:00:00",
    "is_saved": true,
    "is_pinned": false,
    "session_title": null
  }
]
```

---

#### `PUT /history/save/{session_id}`
Retroactively marks all messages in a session as saved (persisted to history).

**Example:** `PUT /history/save/1712345678901`

**Response:**
```json
{ "message": "Session saved successfully." }
```

---

#### `PUT /history/rename/{session_id}`
Renames a saved session with a custom title.

**Request Body:**
```json
{ "title": "My Leave Policy Questions" }
```

**Response:**
```json
{ "message": "Session renamed successfully." }
```

---

### PDF Upload Endpoint

#### `POST /upload`
Uploads a PDF, chunks it, embeds it into ChromaDB, and records it in the database.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file | ✅ | PDF file to upload |
| `admin_id` | string | ❌ | Who performed the upload (default: "System") |
| `start_date` | string | ❌ | Policy effective date (YYYY-MM-DD) |
| `expire_date` | string | ❌ | Policy expiry date (YYYY-MM-DD) |

**Response (200 OK):**
```json
{
  "message": "PDF ingested successfully.",
  "filename": "HR_Policy_2026.pdf",
  "chunks_added": 47
}
```

**Chunking Details:**
- Chunk size: **800 characters**
- Chunk overlap: **100 characters**
- Each chunk is prefixed with: `[Source: filename.pdf, Page: X, Paragraph/Chunk: N]`
- Chunks are stored in ChromaDB with IDs like `HR_Policy_2026.pdf_0`, `HR_Policy_2026.pdf_1`, etc.
- QueryCache is cleared after every upload

---

### Admin Document Endpoints

#### `GET /admin/documents`
Lists all tracked knowledge documents.

**Response:**
```json
[
  {
    "id": 1,
    "filename": "HR_Policy_2026.pdf",
    "start_date": "2026-01-01",
    "expire_date": "2026-12-31",
    "admin_id": "master_admin",
    "created_at": "2026-04-09T09:00:00"
  }
]
```

---

#### `DELETE /admin/document/{filename}`
Deletes all ChromaDB chunks for the given filename, removes it from the database, and deletes the local file copy.

**Example:** `DELETE /admin/document/HR_Policy_2026.pdf`

**Response:**
```json
{
  "message": "Deleted 47 chunks and removed document.",
  "filename": "HR_Policy_2026.pdf"
}
```

---

#### `POST /admin/document/rename`
Renames a document in the database, updates ChromaDB metadata, and renames the local file.

**Request Body:**
```json
{
  "old_filename": "OLD_HR_Policy.pdf",
  "new_filename": "HR_Policy_2026.pdf",
  "admin_id": "master_admin"
}
```

**Response:**
```json
{ "message": "Document renamed successfully." }
```

---

#### `POST /admin/document/update`
Updates the start/expiry dates for a tracked document.

**Request Body:**
```json
{
  "filename": "HR_Policy_2026.pdf",
  "start_date": "2026-01-01",
  "expire_date": "2026-12-31",
  "admin_id": "master_admin"
}
```

**Response:**
```json
{ "message": "Document dates updated." }
```

---

#### `GET /admin/chunks`
Returns all embedded chunks with preview text and metadata.

**Response:**
```json
{
  "total": 47,
  "chunks": [
    {
      "id": "HR_Policy_2026.pdf_0",
      "text": "[Source: HR_Policy_2026.pdf, Page: 1, Paragraph/Chunk: 1]\nThis HR policy covers...",
      "metadata": {
        "source_filename": "HR_Policy_2026.pdf",
        "page": 0
      }
    }
  ]
}
```

---

#### `GET /admin/logs`
Returns the document action history (upload, delete, rename, modify).

**Response:**
```json
[
  {
    "id": 1,
    "action": "UPLOAD",
    "filename": "HR_Policy_2026.pdf",
    "chunks_count": 47,
    "created_at": "2026-04-09T09:00:00",
    "admin_id": "master_admin"
  }
]
```

---

#### `GET /documents`
Returns the total chunk count in ChromaDB.

**Response:**
```json
{ "total_chunks": 47 }
```

---

### Account Management Endpoints

#### `GET /admin/account`
Returns all non-master accounts.

**Response:**
```json
[
  {
    "id": 2,
    "username": "john_doe",
    "role": "user",
    "name": "John Doe",
    "emp_num": "EMP-001",
    "designation": "Software Engineer",
    "department": "IT",
    "created_at": "2026-04-09T09:00:00"
  }
]
```

---

#### `POST /admin/account`
Creates a new user or admin account.

**Request Body:**
```json
{
  "username": "john_doe",
  "password": "secure_pass_123",
  "role": "user",
  "name": "John Doe",
  "emp_num": "EMP-001",
  "designation": "Software Engineer",
  "department": "IT"
}
```

Valid roles: `user`, `subadmin`, `admin`

**Response (201):**
```json
{ "message": "user added successfully." }
```

---

#### `PUT /admin/account/{username}`
Updates an existing account's role, name, employee number, or password.

**Example:** `PUT /admin/account/john_doe`

**Request Body:**
```json
{
  "role": "subadmin",
  "name": "John Doe",
  "emp_num": "EMP-001",
  "password": ""
}
```
> Leave `password` blank or empty to keep the existing password.

**Response:**
```json
{ "message": "Account updated successfully." }
```

---

#### `DELETE /admin/account/{username}`
Deletes an account. Cannot delete `master_admin`.

**Example:** `DELETE /admin/account/john_doe`

**Response:**
```json
{ "message": "Account deleted successfully." }
```

---

### File Download

#### `GET /download/{filename}`
Serves the original PDF file inline in the browser.

**Example:** `GET /download/HR_Policy_2026.pdf`

Returns the PDF with `Content-Disposition: inline`.

---

## 8. LangGraph Multi-Agent Pipeline

The pipeline is defined as a `StateGraph` in `main.py`. Each node is a pure Python function that receives the full state and returns an updated state.

### State Definition

```python
class AgentState(TypedDict):
    query: str               # The employee's question
    employee_id: str         # For audit logging
    session_id: str          # Groups messages into sessions
    save_chat: bool          # Should this session be persisted?
    retrieved_chunks: List[str]  # Retrieved document chunks from ChromaDB
    draft_response: str      # Current working response
    final_response: str      # The final response sent to the user
    hallucination_check: str # 'pass' or 'fail'
    accuracy_score: str      # E.g., '92%' from Reviewer
    rewrite_count: int       # How many times Communicator has rewritten (max 2)
    current_agent: str       # Used for SSE streaming (which agent is active)
```

### Node Descriptions

| Node | Role | Model Used |
|---|---|---|
| **Researcher** | Embeds the query using `all-MiniLM-L6-v2` and retrieves the top-3 most similar chunks from ChromaDB | None (vector search only) |
| **Compliance** | Analyzes whether the retrieved context is ethically and legally sufficient to answer the query | Ollama llama3 |
| **Communicator** | Drafts a professional response citing only the retrieved document context. Refuses to answer if info is not in context. | Ollama llama3 |
| **Reviewer** | Compares the draft response against the context. Returns a JSON verdict `{"verdict": "PASS", "accuracy": "92%"}` | Ollama llama3 |
| **Audit** | Saves the final Q&A pair to MSSQL `AuditTrail` and `QueryCache` | None (DB write only) |

### Graph Edges

```
researcher ──► compliance ──► communicator ──► reviewer
                                                   │
                    ┌──────────── PASS ────────────┘
                    │
                   audit ──► END
                    │
                    └──────────── FAIL ──► increment_rewrite ──► communicator
                                            (max 2 retries)
```

### Hallucination Guard

- `MAX_REWRITES = 2` — The Communicator gets **at most 2 retries** if the Reviewer rejects its response.
- After 2 failed rewrites, the pipeline proceeds to audit with whatever the last draft was.
- The `accuracy_score` and `hallucination_check` are sent back to the frontend via SSE.

### Communicator System Prompt (key safety rule)

```
You MUST answer exclusively from the provided DOCUMENT CONTEXT.
If the answer is not clearly contained within the context (including general
knowledge, greetings, maths, or day-to-day questions), YOU MUST explicitly
state: 'I am not authorized to answer this question as it is outside the
scope of internal company policies.'
Do NOT fabricate, hallucinate, or use outside knowledge.
Only if you found the answer strictly inside the context, you MUST include
citations in the format: [Source: filename.pdf, Page: X]
```

---

## 9. Frontend Features

### Login Screen
- Username / password form
- Backend health check on load
- Error handling with visible messages

### Chat View (`/chat`)

| Feature | Description |
|---|---|
| **SSE Streaming** | Response streams token-by-token; no waiting for full response |
| **Agent Pipeline Progress Bar** | Shows which node is currently active (Researcher → Compliance → Communicator → Reviewer → Done) |
| **Chat History Sidebar** | Left panel showing saved sessions, searchable |
| **Restore Past Sessions** | Click any saved session to reload its messages |
| **Rename Sessions** | Inline edit to give sessions a custom title |
| **Library Tab** | Lists all uploaded PDFs with download links |
| **Save Chat Toggle** | Toggle to opt-in to saving the session to history |
| **Edit & Resend** | Edit a previous message and the pipeline reruns from that point |
| **New Chat** | Starts a fresh session with a new session ID |
| **Typing Indicator** | Shows animated dots while the pipeline is running |
| **Accuracy Badge** | Shows `92%` accuracy score from the Reviewer node |
| **Hallucination Badge** | Shows ✅ PASS or ❌ FAIL indicator from Reviewer |

### Admin Dashboard (`/admin`)

| Section | Feature |
|---|---|
| **Upload PDF** | Drag-and-drop or click-to-browse. Shows upload progress bar. Accepts start/expiry dates. |
| **Document Action Logs** | Lists all UPLOAD, DELETE, RENAME, MODIFY actions with timestamps and chunk counts. Exportable to PDF using jsPDF. |
| **Knowledge Documents** | Expandable document list with inline editing (rename, date change), chunk browser, and delete. |
| **User Management** | Add/edit/delete user accounts. Assign roles: `user`, `subadmin`, `admin`. |

### Theme
- Dark mode by default (deep navy/indigo palette)
- Light mode toggle (CSS invert technique)
- Glassmorphism UI cards
- Smooth animated transitions (Tailwind animations)
- Inter font via Google Fonts

---

## 10. User Roles & Permissions

| Permission | `user` | `subadmin` | `admin` | `master` |
|---|---|---|---|---|
| Access Chat View | ✅ | ✅ | ✅ | ✅ |
| View Document Library | ✅ | ✅ | ✅ | ✅ |
| Access Admin Dashboard | ❌ | ✅ | ✅ | ✅ |
| Upload Documents | ❌ | ✅ | ✅ | ✅ |
| Delete / Rename Documents | ❌ | ✅ | ✅ | ✅ |
| View Action Logs | ❌ | ✅ | ✅ | ✅ |
| Manage Users (create/delete) | ❌ | ❌ | ✅ | ✅ |
| Create Admin accounts | ❌ | ❌ | ❌ | ✅ |
| Delete `master_admin` | ❌ | ❌ | ❌ | ❌ (protected) |

---

## 11. Configuration & Environment

Copy `.env.example` to `.env` and adjust:

```env
# Ollama LLM settings
OLLAMA_MODEL=llama3
OLLAMA_BASE_URL=http://localhost:11434

# HuggingFace Embeddings (downloaded automatically on first run)
EMBED_MODEL=all-MiniLM-L6-v2

# ChromaDB local persistence directory (relative to main.py)
CHROMA_PERSIST_DIR=./chroma_db

# MSSQL connection (Windows Authentication)
MSSQL_SERVER=localhost\SQLEXPRESS
MSSQL_DATABASE=SDF_Copilot
MSSQL_USER=
MSSQL_PASSWORD=

# PDF upload directory  
UPLOAD_DIR=./uploads

# Maximum hallucination rewrites before forcing audit output
MAX_REWRITES=2

# RAG – number of chunks to retrieve per query
RAG_TOP_K=3
```

> **Note:** The environment variables in `.env` are currently informational. The values are hard-coded in `main.py` for simplicity. To fully enable `.env` loading, add `python-dotenv` loading at the top of `main.py`:
> ```python
> from dotenv import load_dotenv
> load_dotenv()
> ```

---

## 12. Utility Scripts

### `reset_kb.py` — Full Knowledge Base Wipe

⚠️ **This is destructive. It will delete all data.**

```powershell
cd backend
.\venv\Scripts\activate
python reset_kb.py
```

**What it does:**
1. Deletes the entire `chroma_db/` folder (all embedded vectors)
2. Deletes all files in `uploads/` (local PDF copies)
3. Clears these SQL tables: `DocumentLogs`, `KnowledgeDocuments`, `AuditTrail`, `QueryCache`

Use this when you want to start the knowledge base completely fresh.

---

## 13. Troubleshooting

### ❌ Backend fails to start: `pyodbc.Error` / `Database connection failed`

**Cause:** SQL Server Express is not running or ODBC Driver 17 is not installed.

**Fix:**
1. Open **Services** (`Win + R` → `services.msc`) → Find `SQL Server (SQLEXPRESS)` → Start
2. Run `setup_db.sql` in SSMS to create tables
3. Install [ODBC Driver 17](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

---

### ❌ `ollama: command not found` or LLM errors

**Fix:**
1. Verify Ollama is installed: `ollama --version`
2. Verify llama3 model exists: `ollama list`
3. Re-pull if needed: `ollama pull llama3`
4. Ensure Ollama service is running (should auto-start, or run `ollama serve`)

---

### ❌ Chat responses say "No relevant documents found"

**Cause:** No PDFs have been uploaded yet, or ChromaDB is empty.

**Fix:**
1. Log in as `master_admin`
2. Go to Admin Dashboard → Upload a PDF policy document
3. Wait for the success message (e.g., "47 chunks added")
4. Try your query again

---

### ❌ Frontend shows `CORS error` or can't reach backend

**Fix:**
1. Make sure the backend is running on `http://127.0.0.1:8000`
2. Check that `api.js` has `baseURL: 'http://127.0.0.1:8000'`
3. The backend already has `allow_origins=["*"]` — this should not be an issue in local dev

---

### ❌ HuggingFace model download fails

**Fix:** The `all-MiniLM-L6-v2` model is downloaded from HuggingFace Hub on first startup. If it fails:
1. Check your internet connection
2. Or pre-download manually:
   ```powershell
   pip install huggingface_hub
   python -c "from huggingface_hub import snapshot_download; snapshot_download('sentence-transformers/all-MiniLM-L6-v2')"
   ```

---

### ❌ `Import error` or version conflicts

**Fix:** Always use the virtual environment:
```powershell
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt --upgrade
```

---

### ❌ Reviewer node returns `FAIL` every time

**Cause:** llama3 sometimes returns malformed JSON or wrapped in markdown code blocks.

**Behavior:** The pipeline automatically falls back to audit after `MAX_REWRITES=2` retries. The response will still be returned to the user — it will just be marked as `hallucination_check: fail`.

**Fix:** This is normal for smaller models. Consider using `llama3.1` or `mistral` for better JSON compliance:
```powershell
ollama pull llama3.1
# Then change OLLAMA_MODEL=llama3.1 in .env / main.py
```

---

*Built for internal enterprise use. All data stays 100% on your machine.*
