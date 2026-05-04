import os
import shutil
import pyodbc
from pathlib import Path

BASE_DIR = Path(__file__).parent
CHROMA_DIR = BASE_DIR / "chroma_db"
UPLOAD_DIR = BASE_DIR / "uploads"

mssql_server = os.getenv("MSSQL_SERVER", "localhost\\SQLEXPRESS")
mssql_db = os.getenv("MSSQL_DATABASE", "SDF_Copilot")
mssql_user = os.getenv("MSSQL_USER", "")
mssql_pass = os.getenv("MSSQL_PASSWORD", "")

if mssql_user and mssql_pass:
    MSSQL_CONN_STR = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={mssql_server};"
        f"DATABASE={mssql_db};"
        f"UID={mssql_user};"
        f"PWD={mssql_pass};"
        "TrustServerCertificate=yes;"
    )
else:
    MSSQL_CONN_STR = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={mssql_server};"
        f"DATABASE={mssql_db};"
        "Trusted_Connection=yes;"
    )

def wipe_data():
    print("🗑️ Wiping ChromaDB Vector Store...")
    if CHROMA_DIR.exists():
        shutil.rmtree(CHROMA_DIR)
        print("✅ ChromaDB wiped.")

    print("🗑️ Wiping Uploaded PDFs...")
    if UPLOAD_DIR.exists():
        for f in UPLOAD_DIR.iterdir():
            if f.is_file():
                f.unlink()
        print("✅ Uploaded copies wiped.")

    print("🗑️ Wiping SQL Document Tables...")
    try:
        conn = pyodbc.connect(MSSQL_CONN_STR)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM DocumentLogs")
        cursor.execute("DELETE FROM KnowledgeDocuments")
        cursor.execute("DELETE FROM AuditTrail")  # Also wipe old history
        cursor.execute("DELETE FROM QueryCache")
        conn.commit()
        conn.close()
        print("✅ SQL tables wiped (DocumentLogs, KnowledgeDocuments, AuditTrail, QueryCache).")
    except Exception as e:
        print(f"❌ SQL wipe failed: {e}")

    print("🚀 All knowledge base and history data completely wiped. Starting fresh!")

if __name__ == "__main__":
    wipe_data()
