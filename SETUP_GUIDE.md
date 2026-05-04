# SDF AI Copilot — Complete Setup Guide
### Fresh Machine Setup (Windows 10 / 11)

> Follow every step in order. Do not skip any step.
> Estimated total setup time: **45–90 minutes** (mostly downloads)

---

## What You Will Download & Install

| Software | Purpose | Size |
|---|---|---|
| Python 3.11 | Runs the backend | ~25 MB |
| Node.js 20 LTS | Runs the frontend | ~30 MB |
| Ollama | Runs the AI model locally | ~90 MB |
| llama3 model | The AI brain | ~4.7 GB |
| SQL Server Express 2022 | The audit database | ~300 MB |
| SSMS (optional) | Database management GUI | ~600 MB |
| ODBC Driver 17 | Connects Python to SQL Server | ~15 MB |
| Git (optional) | To clone/copy the project | ~50 MB |

---

## STEP 1 — Copy the Project Folder

Copy the entire `Local_Agent` folder to the new laptop.

You can copy it using:
- USB Flash Drive
- Google Drive / OneDrive
- Any file sharing method

Place it somewhere easy, for example:
```
C:\Users\YourName\Desktop\Local_Agent\
```

The folder must contain:
```
Local_Agent/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── setup_db.sql
│   ├── reset_kb.py
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── index.html
│   └── vite.config.js
└── README.md
```

---

## STEP 2 — Install Python 3.11

> ⚠️ Do NOT install Python 3.13 or higher. The project requires Python 3.11 or 3.12.

1. Go to: **https://www.python.org/downloads/release/python-3119/**
2. Scroll down to **"Files"** section
3. Download: `Windows installer (64-bit)` — the file named `python-3.11.9-amd64.exe`
4. Run the installer
5. **IMPORTANT:** On the first screen, tick the box that says **"Add Python to PATH"**
6. Click **"Install Now"**
7. Wait for installation to finish, then click **Close**

**Verify Python installed correctly:**
1. Press `Win + R`, type `cmd`, press Enter
2. Type: `python --version`
3. You should see: `Python 3.11.9`

---

## STEP 3 — Install Node.js

1. Go to: **https://nodejs.org/en/download**
2. Download: **Windows Installer (.msi)** — LTS version (Node 20)
3. Run the installer, click Next → Next → Install
4. Wait for it to finish, click Finish

**Verify Node.js installed:**
1. Open a new Command Prompt (`Win + R` → `cmd`)
2. Type: `node --version`
3. You should see: `v20.x.x`
4. Also type: `npm --version`
5. You should see: `10.x.x`

---

## STEP 4 — Install Ollama (Local AI Engine)

1. Go to: **https://ollama.com/download/windows**
2. Click **Download for Windows**
3. Run `OllamaSetup.exe`
4. Follow the installer (it installs itself automatically)
5. After install, Ollama runs as a background service

**Download the llama3 AI Model:**

> ⚠️ This downloads 4.7 GB. Make sure you have a good internet connection and enough disk space.

1. Open Command Prompt (`Win + R` → `cmd`)
2. Type this command and press Enter:
```
ollama pull llama3
```
3. Wait for the download to complete (shows a progress bar)

**Verify Ollama is working:**
```
ollama list
```
You should see `llama3` in the list.

**Test it responds:**
```
ollama run llama3 "say hello"
```
It should reply with a greeting. Press `Ctrl+D` to exit.

---

## STEP 5 — Install SQL Server Express

This is the database that stores the audit trail and user accounts.

1. Go to: **https://www.microsoft.com/en-us/sql-server/sql-server-downloads**
2. Scroll down and click **Download now** under **Express** (free edition)
3. Run `SQL2022-SSEI-Expr.exe`
4. Choose **"Basic"** installation type
5. Accept the license, click Install
6. Wait for it to finish (~5 minutes)
7. Note the **connection string** shown at the end — it will say something like:  
   `Server=localhost\SQLEXPRESS`

---

## STEP 6 — Install SSMS (Database Management Tool)

SSMS lets you visually manage the database and run the setup script.

1. Go to: **https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms**
2. Click the download link for the latest SSMS version
3. Run `SSMS-Setup-ENU.exe`
4. Click Install, wait for it to finish (5–10 minutes)
5. Restart your computer if prompted

---

## STEP 7 — Install ODBC Driver 17

This lets Python connect to SQL Server.

1. Go to: **https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server**
2. Under **"Microsoft ODBC Driver 17 for SQL Server"**, click **Download**
3. Choose: `msodbcsql.msi` (x64) for 64-bit Windows
4. Run the installer, click Next → Next → Install → Finish

---

## STEP 8 — Create the Database Using SSMS

Now we use SSMS to create all the database tables the project needs.

1. Open **SSMS** (search "SQL Server Management Studio" in Start Menu)
2. In the **"Connect to Server"** dialog:
   - **Server name:** `localhost\SQLEXPRESS`
   - **Authentication:** `Windows Authentication`
   - Click **Connect**
3. In the top menu, click **File → Open → File...**
4. Navigate to your project folder: `Local_Agent\backend\setup_db.sql`
5. Click **Open**
6. Press **F5** (or click the **Execute** button)
7. You should see messages like:
   ```
   Database SDF_Copilot created.
   Table Accounts created successfully.
   Table AuditTrail created successfully.
   ...
   === SDF_Copilot database setup complete ===
   ```

> ✅ The database is now ready. A default admin account was also created:
> - **Username:** `master_admin`
> - **Password:** `admin123`

---

## STEP 9 — Set Up the Backend (Python)

Open a **PowerShell** terminal (not Command Prompt):
- Press `Win + X` → Click **Terminal** or **PowerShell**

Run these commands one by one:

**Go to the backend folder:**
```powershell
cd C:\Users\YourName\Desktop\Local_Agent\backend
```
*(Replace `YourName` with your actual Windows username)*

**Create a virtual environment:**
```powershell
python -m venv venv
```

**Activate the virtual environment:**
```powershell
.\venv\Scripts\Activate
```
You should see `(venv)` appear at the start of the command line.

**Install all Python packages:**
```powershell
pip install -r requirements.txt
```
> ⚠️ This will download and install packages totalling about 1.5 GB. It takes 5–15 minutes on the first run. Wait for it to fully complete.

**Start the backend server:**
```powershell
python main.py
```

You should see this output:
```
INFO | SDF AI Copilot backend starting up…
INFO | Loading HuggingFace embeddings model...
INFO | Initialising ChromaDB...
INFO | Uvicorn running on http://127.0.0.1:8000
```

> ✅ **Leave this terminal window open.** The backend must keep running.

---

## STEP 10 — Set Up the Frontend (React)

Open a **second, new PowerShell terminal** (do not close the first one):

**Go to the frontend folder:**
```powershell
cd C:\Users\YourName\Desktop\Local_Agent\frontend
```

**Install Node packages:**
```powershell
npm install
```
> This installs all frontend packages from `package.json`. Takes 1–3 minutes.

**Start the frontend development server:**
```powershell
npm run dev
```

You should see:
```
  VITE v6.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

## STEP 11 — Open the App

Open your web browser (Chrome or Edge recommended).

Go to:
```
http://localhost:5173
```

You should see the **SDF AI Copilot login screen**.

Log in with:
- **Username:** `master_admin`
- **Password:** `admin123`

> ⚠️ Please change this password after your first login by editing the account in the Admin Dashboard.

---

## STEP 12 — Upload Your First Document

Before the AI can answer questions, you need to upload at least one PDF document.

1. Log in as `master_admin`
2. Click **"Admin Dashboard"** in the left sidebar
3. In the **"Upload Policy Document"** section, click or drag-and-drop a PDF
4. (Optional) Set a Start Date and Expire Date for the document
5. Click **"Ingest into Knowledge Base"**
6. Wait for the success message (e.g., "47 chunks added")

Now switch to the **"AI Copilot"** view and ask a question!

---

## Quick Start Checklist

Use this every time you want to run the app:

- [ ] Make sure SQL Server is running (it usually starts automatically)
- [ ] Make sure Ollama is running (it starts automatically in background)
- [ ] Open Terminal 1 → `cd backend` → activate venv → `python main.py`
- [ ] Open Terminal 2 → `cd frontend` → `npm run dev`
- [ ] Open browser → `http://localhost:5173`

---

## Troubleshooting

### ❌ `python` is not recognized
- Reinstall Python and make sure to tick **"Add to PATH"** during install
- Or use `python3` instead of `python`

### ❌ Backend error: `pyodbc.Error` / `Login failed`
- Open SSMS and verify you can connect to `localhost\SQLEXPRESS`
- Make sure you ran `setup_db.sql` in SSMS
- Make sure ODBC Driver 17 is installed

### ❌ Backend error: `ConnectionRefusedError: [Errno 111]` (Ollama)
- Run `ollama serve` in a new terminal to start Ollama manually
- Or check Windows Services for "Ollama"

### ❌ `npm install` fails
- Delete the `node_modules` folder and try again
- Make sure Node.js 20 LTS is installed (not an older version)

### ❌ The AI says "No relevant documents found"
- You haven't uploaded any PDFs yet
- Go to Admin Dashboard and upload at least one PDF

### ❌ Login fails with "Invalid username or password"
- Use exactly: `master_admin` / `admin123`
- Make sure the database was set up correctly with `setup_db.sql`

---

## Important Ports

| Service | Address |
|---|---|
| Frontend (React) | http://localhost:5173 |
| Backend (FastAPI) | http://127.0.0.1:8000 |
| API Documentation | http://127.0.0.1:8000/docs |
| Ollama | http://localhost:11434 |

---

## Download Links Summary

| Software | Download URL |
|---|---|
| Python 3.11 | https://www.python.org/downloads/release/python-3119/ |
| Node.js 20 LTS | https://nodejs.org/en/download |
| Ollama (Windows) | https://ollama.com/download/windows |
| SQL Server Express | https://www.microsoft.com/en-us/sql-server/sql-server-downloads |
| SSMS | https://aka.ms/ssmsfullsetup |
| ODBC Driver 17 | https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server |

---

*Keep this guide for future reference. Share the entire `Local_Agent` folder with anyone who needs to run this system.*
