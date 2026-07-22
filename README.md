# SDF AI Copilot

> **Enterprise AI Assistant for Internal Policy & Procedure Documents**  
> Powered by Google Vertex AI (Gemini 2.5 Flash) · LangGraph · FastAPI · React · MSSQL

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Environment Setup](#5-environment-setup)
6. [Database Schema](#6-database-schema)
7. [Production Deployment](#7-production-deployment)
8. [Admin Tools](#8-admin-tools)
9. [API Reference](#9-api-reference)
10. [AI Agent Pipeline](#10-ai-agent-pipeline)
11. [User Roles & Access](#11-user-roles--access)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

**SDF AI Copilot** is a production-grade AI assistant that enables Sarvodaya Development Finance (SDF) employees to query internal company policy documents through a secure, conversational interface.

Employees log in with their official `@sdf.lk` Google account (SSO). The AI reads uploaded policy PDFs, understands questions in plain language, and responds with accurate, cited answers — verified by a multi-agent hallucination-checking pipeline.

### Key Features

| Feature | Detail |
|---|---|
| **AI Model** | Google Vertex AI — `gemini-2.5-flash` |
| **PDF Parsing** | LlamaParse (cloud-based, high accuracy) |
| **Vector Store** | ChromaDB (persistent, on-server) |
| **Embeddings** | Google `text-embedding-004` |
| **Agent Pipeline** | LangGraph — Researcher → Communicator → Reviewer → Audit |
| **Semantic Cache** | ChromaDB-based similarity cache (reduces API costs) |
| **Authentication** | Google SSO (`@sdf.lk` accounts) |
| **Database** | Microsoft SQL Server 2022 (Ubuntu) |
| **API** | FastAPI with SSE streaming |
| **Frontend** | React 19 + Vite + TailwindCSS |
| **Process Manager** | PM2 (20 workers, 24-core server) |
| **Reverse Proxy** | Nginx |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend                            │
│  (Vite + TailwindCSS · Port 4397)                           │
│                                                             │
│  ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │  Google SSO  │   │  Chat View (SSE Streaming)          │  │
│  │  Login Page  │   │  • Session History Sidebar          │  │
│  └──────────────┘   │  • Agent Pipeline Progress View     │  │
│  ┌──────────────┐   │  • Document Citations & Download    │  │
│  │  Admin Panel │   └────────────────────────────────────┘  │
│  │  • Upload PDF│                                           │
│  │  • Manage KB │                                           │
│  │  • Audit Logs│                                           │
│  │  • User Mgmt │                                           │
│  └──────────────┘                                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / SSE
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           Nginx Reverse Proxy (Port 80 / 443)               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          FastAPI Backend  (Port 8000 · PM2 · 20 Workers)    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               LangGraph Pipeline                      │   │
│  │                                                       │   │
│  │  Semantic Cache Check                                 │   │
│  │       │                                               │   │
│  │       ├── CACHE HIT  → Return instantly ($0.00)       │   │
│  │       │                                               │   │
│  │       └── CACHE MISS → Run AI Pipeline:               │   │
│  │                                                       │   │
│  │  [Researcher] → [Communicator] → [Reviewer]           │   │
│  │                                      │                │   │
│  │                              ┌───────┴──────┐         │   │
│  │                           PASS            FAIL        │   │
│  │                              │         (retry ≤3)     │   │
│  │                              ▼               │        │   │
│  │                         [Audit Node] ◄───────┘        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────┐  │
│  │  ChromaDB    │  │  Google Vertex AI │  │  MSSQL      │  │
│  │  (chroma_db/)│  │  Gemini 2.5 Flash │  │  Audit DB   │  │
│  │  Vector Store│  │  text-embedding   │  │  SDF_Copilot│  │
│  └──────────────┘  └───────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Chat Request Flow

```
Employee asks a question
        │
        ▼
FastAPI /chat/stream
        │
        ├── Semantic Cache Check (ChromaDB cosine similarity)
        │        ├── HIT  → Return cached answer instantly ($0.00 cost)
        │        └── MISS → Continue to AI Pipeline
        │
        └── LangGraph Pipeline:
              1. RESEARCHER   → Embed query, retrieve top chunks from ChromaDB
              2. COMMUNICATOR → Gemini 2.5 Flash drafts a cited answer
              3. REVIEWER     → Gemini 2.5 Flash verifies answer (hallucination check)
                    ├── PASS  → AUDIT node (save to MSSQL + cache result)
                    └── FAIL  → Rewrite (max 3 attempts) → AUDIT node
              4. AUDIT NODE   → Logs to AuditTrail table in MSSQL
        │
        └── Streams SSE events to frontend (real-time agent progress)
```

---

## 3. Tech Stack

### Backend
| Component | Technology |
|---|---|
| Language | Python 3.11 |
| API Framework | FastAPI + Uvicorn |
| AI Orchestration | LangGraph (StateGraph) |
| LLM | Google Vertex AI — `gemini-2.5-flash` |
| Embeddings | Google `text-embedding-004` |
| Vector Database | ChromaDB |
| PDF Parsing | LlamaParse (cloud API) |
| Database | Microsoft SQL Server 2022 |
| DB Driver | pyodbc (ODBC Driver 18) |
| Process Manager | PM2 (20 workers) |

### Frontend
| Component | Technology |
|---|---|
| Framework | React 19 + Vite |
| Styling | TailwindCSS |
| Authentication | Google OAuth 2.0 (SSO) |
| Streaming | Server-Sent Events (SSE) |
| HTTP Client | Axios |

### Infrastructure
| Component | Technology |
|---|---|
| OS | Ubuntu 22.04 LTS |
| Reverse Proxy | Nginx |
| SSL | Let's Encrypt (Certbot) |
| Process Manager | PM2 |
| Domain | `chatbot.staging.sdf.lk` |
| Server IP | `192.168.5.34` |

---

## 4. Project Structure

```
Internal_Policy_Agent/
│
├── backend/
│   ├── main.py                      # Core: FastAPI routes + LangGraph pipeline
│   ├── setup_db.sql                 # MSSQL schema (run once on new server)
│   ├── requirements.txt             # Python dependencies
│   ├── .env                         # Environment variables (NOT in git)
│   ├── .env.example                 # Environment variable template
│   │
│   ├── evaluate_ragas.py            # RAGAS accuracy evaluation script
│   ├── ragas_evaluation_dataset.csv # 20 gold-standard Q&A pairs for testing
│   │
│   ├── view_cache.py                # Admin: View all cached Q&A entries
│   ├── wipe_kb.py                   # Admin: Clear semantic cache
│   ├── reset_kb.py                  # Admin: Full ChromaDB reset
│   ├── update_password.py           # Admin: Change user password via terminal
│   ├── backup_db.py                 # Admin: Backup MSSQL database
│   ├── test_models.py               # Test Google Cloud connectivity
│   │
│   ├── chroma_db/                   # ChromaDB vector store (NOT in git)
│   ├── uploads/                     # Uploaded PDF files (NOT in git)
│   └── venv/                        # Python virtual environment (NOT in git)
│
├── frontend/
│   ├── index.html                   # HTML entry point
│   ├── package.json                 # Node.js dependencies
│   ├── vite.config.js               # Vite config (allowedHosts: true)
│   ├── tailwind.config.js           # Custom brand theme (#5B3FA8)
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx                 # React entry point
│       ├── App.jsx                  # Root component + routing + auth
│       ├── api.js                   # Axios API client
│       ├── index.css                # Global styles + animations
│       └── components/
│           ├── Sidebar.jsx          # Session history sidebar
│           ├── ChatView.jsx         # Main chat interface + SSE
│           ├── MessageBubble.jsx    # Message rendering + citations
│           ├── AdminDashboard.jsx   # Full admin panel
│           ├── Register.jsx         # User registration (admin only)
│           ├── SetupProfile.jsx     # First-time profile setup
│           └── ForgotPassword.jsx   # Password recovery
│
├── documemnt/                       # Documentation
│   ├── SDF_AI_Copilot_Developer_Guide.md
│   ├── FRESH_SERVER_SETUP.md        # Disaster recovery guide
│   └── NETWORK_ALLOWLIST.md         # Firewall rules for network admin
│
├── .gitignore
├── README.md
└── SETUP_GUIDE.md
```

---

## 5. Environment Setup

### `.env` File (required on server)

```env
# Microsoft SQL Server
MSSQL_SERVER=localhost
MSSQL_DATABASE=SDF_Copilot
MSSQL_USER=sa
MSSQL_PASS=<your_sql_password>

# Google Cloud
GOOGLE_CLOUD_PROJECT=<your_gcp_project_id>
GOOGLE_APPLICATION_CREDENTIALS=/home/chatbot/gcp-key.json

# LlamaParse
LLAMA_CLOUD_API_KEY=llx-<your_llamaparse_key>

# Storage Paths
UPLOAD_DIR=./uploads
CHROMA_PERSIST_DIR=./chroma_db

# AI Settings
MAX_REWRITES=2
RAG_TOP_K=5
```

---

## 6. Database Schema

### Tables

| Table | Purpose |
|---|---|
| `Accounts` | User accounts with roles and Google SSO email |
| `AuditTrail` | Every employee query + AI response logged |
| `KnowledgeDocuments` | Uploaded PDFs with validity date ranges |
| `DocumentLogs` | Admin actions (upload, delete, rename) |
| `QueryCache` | Exact-match query cache (cost optimization) |
| `IntelligenceAudit` | Failed hallucination checks (quality monitoring) |
| `GoogleGroups` | Department/committee groups for access control |
| `GroupMembers` | Employee-to-group assignments |

### Roles

| Role | Access Level |
|---|---|
| `master` | Full system access, cannot be deleted |
| `admin` | Manage users, upload/delete documents |
| `subadmin` | Upload documents, view audit logs |
| `user` | Chat only, view own history |

---

## 7. Production Deployment

### Server Details
- **OS:** Ubuntu 22.04 LTS
- **IP:** `192.168.5.34`
- **CPU:** 24 cores
- **RAM:** 64 GB
- **Domain:** `chatbot.staging.sdf.lk`

### Start / Restart Services

```bash
# Restart backend (after code changes)
pm2 restart sdf-backend

# Restart frontend
pm2 restart sdf-frontend

# Check status
pm2 status

# View live logs
pm2 monit

# View backend logs
pm2 logs sdf-backend
```

### Deploy Code Updates

```bash
cd ~/Internal_Policy_Agent
git pull origin main
pm2 restart all
```

### PM2 Configuration

| Service | Port | Workers | Command |
|---|---|---|---|
| `sdf-backend` | 8000 | 20 | `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 20` |
| `sdf-frontend` | 4397 | 1 | `npm run dev -- --port 4397 --host` |

### Nginx Config Location
```
/etc/nginx/sites-available/sdf-chatbot
```

---

## 8. Admin Tools

All tools are run from the server backend directory:
```bash
cd ~/Internal_Policy_Agent/backend
source venv/bin/activate
```

| Script | Purpose | Command |
|---|---|---|
| `view_cache.py` | View all cached Q&A pairs | `python3 view_cache.py` |
| `wipe_kb.py` | Clear semantic cache | `python3 wipe_kb.py` |
| `reset_kb.py` | Full ChromaDB reset | `python3 reset_kb.py` |
| `update_password.py` | Change user password | `python3 update_password.py` |
| `backup_db.py` | Backup MSSQL database | `python3 backup_db.py` |
| `evaluate_ragas.py` | Run accuracy evaluation | `python3 evaluate_ragas.py` |
| `test_models.py` | Test Google Cloud connection | `python3 test_models.py` |

> ⚠️ **Important:** Always clear the semantic cache (`wipe_kb.py`) after uploading or deleting policy documents to prevent stale cached answers.

---

## 9. API Reference

Base URL (Production): `https://chatbot.staging.sdf.lk/api`  
Local Development: `http://localhost:8000`  
Swagger UI: `http://localhost:8000/docs`

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check |
| `POST` | `/auth/google` | Google SSO authentication |
| `POST` | `/chat/stream` | SSE streaming chat (main AI endpoint) |
| `GET` | `/history/{email}` | Get user's chat history |
| `PUT` | `/history/save/{session_id}` | Save a chat session |
| `PUT` | `/history/rename/{session_id}` | Rename a session |
| `POST` | `/upload` | Upload PDF to knowledge base |
| `GET` | `/admin/documents` | List all knowledge documents |
| `DELETE` | `/admin/document/{filename}` | Delete a document |
| `GET` | `/admin/logs` | View document action logs |
| `GET` | `/admin/audit` | View employee query audit trail |
| `GET` | `/admin/account` | List all user accounts |
| `POST` | `/admin/account` | Create a new account |
| `PUT` | `/admin/account/{username}` | Update an account |
| `DELETE` | `/admin/account/{username}` | Delete an account |

---

## 10. AI Agent Pipeline

The system uses a **LangGraph StateGraph** with 4 nodes:

### Node 1: Researcher
- Converts the user query into a vector embedding
- Searches ChromaDB for the most relevant document chunks
- Filters results by cosine distance threshold

### Node 2: Communicator
- Receives document chunks from Researcher
- Uses Gemini 2.5 Flash to draft a professional, cited answer
- Cites sources as `[Source: filename.pdf, Page: X]`

### Node 3: Reviewer
- Re-reads the original document chunks
- Verifies the Communicator's answer for hallucinations
- Returns a JSON verdict: `{"result": "pass/fail", "reason": "..."}`
- If FAIL: increments `rewrite_count`, sends back to Communicator
- If `rewrite_count >= MAX_REWRITES (2)`: forces route to Audit

### Node 4: Audit
- Saves the final interaction to `AuditTrail` (MSSQL)
- Saves the answer to `IntelligenceAudit` if hallucination check failed
- Caches the answer in ChromaDB semantic cache for future similar queries

---

## 11. User Roles & Access

Authentication is handled via **Google OAuth 2.0**. Only `@sdf.lk` email addresses are permitted.

Upon first login, users are prompted to complete their profile (Employee Number, Department, Designation).

Access is further controlled by **Google Groups** (departments and committees). Documents can be restricted to specific groups.

---

## 12. Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `502 Bad Gateway` | Backend not running | `pm2 restart sdf-backend` |
| `Blocked request` error | Vite host check | Verify `allowedHosts: true` in `vite.config.js` |
| `MSSQL connection failed` | SQL Server down | `sudo systemctl start mssql-server` |
| `Google Auth error` | Bad/missing credentials | Check `gcp-key.json` path in `.env` |
| `Name resolution failed` | DNS blocked by firewall | Allow outbound Port 53 in UFW / network firewall |
| AI gives wrong answers | Stale cache | Run `python3 wipe_kb.py` then re-warm cache |
| PDF not found | `uploads/` missing | Check `uploads/` folder exists on server |
| PM2 not starting on reboot | Startup not configured | Run `pm2 startup` and execute the output command |

### Emergency Restart

```bash
pm2 delete all

cd ~/Internal_Policy_Agent/backend
pm2 start "./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 20" \
  --name "sdf-backend"

cd ~/Internal_Policy_Agent/frontend
pm2 start npm --name "sdf-frontend" -- run dev -- --port 4397 --host

pm2 save
```

---

## Network Firewall Requirements

For the full outbound allowlist required by your network administrator, see:  
[`documemnt/NETWORK_ALLOWLIST.md`](./documemnt/NETWORK_ALLOWLIST.md)

---

## Developer Documentation

For full technical documentation including architecture decisions, MSSQL schema, and emergency procedures, see:  
[`documemnt/SDF_AI_Copilot_Developer_Guide.md`](./documemnt/SDF_AI_Copilot_Developer_Guide.md)

For fresh server setup (disaster recovery), see:  
[`documemnt/FRESH_SERVER_SETUP.md`](./documemnt/FRESH_SERVER_SETUP.md)

---

*SDF AI Copilot — Sarvodaya Development Finance PLC*  
*Developed by SDF IT Development Team · 2026*
