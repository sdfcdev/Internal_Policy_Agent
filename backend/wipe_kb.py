
import os
import shutil
from pathlib import Path
import pyodbc
from dotenv import load_dotenv

load_dotenv()

# Configuration
BASE_DIR = Path(__file__).parent
CHROMA_DIR = BASE_DIR / "chroma_db"
UPLOAD_DIR = BASE_DIR / "uploads"

MSSQL_SERVER = os.getenv("MSSQL_SERVER", "localhost\\SQLEXPRESS")
MSSQL_DATABASE = os.getenv("MSSQL_DATABASE", "SDF_Copilot")
MSSQL_USER = os.getenv("MSSQL_USER", "")
MSSQL_PASS = os.getenv("MSSQL_PASSWORD", "")

def get_db_connection():
    drivers = ["{ODBC Driver 17 for SQL Server}", "{ODBC Driver 18 for SQL Server}", "{SQL Server}"]
    for drv in drivers:
        try:
            if MSSQL_USER and MSSQL_PASS:
                conn_str = f"DRIVER={drv};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};UID={MSSQL_USER};PWD={MSSQL_PASS};TrustServerCertificate=yes;"
            else:
                conn_str = f"DRIVER={drv};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;"
            return pyodbc.connect(conn_str)
        except: continue
    return None

def wipe_everything():
    print("🧹 Starting Wipe Process...")

    # 1. Clear ChromaDB
    if CHROMA_DIR.exists():
        print(f"🗑️ Deleting ChromaDB folder at {CHROMA_DIR}...")
        shutil.rmtree(CHROMA_DIR)
        CHROMA_DIR.mkdir()
        print("✅ ChromaDB cleared.")

    # 2. Clear Uploads
    if UPLOAD_DIR.exists():
        print(f"🗑️ Deleting uploads folder at {UPLOAD_DIR}...")
        shutil.rmtree(UPLOAD_DIR)
        UPLOAD_DIR.mkdir()
        print("✅ Uploads folder cleared.")

    # 3. Clear MSSQL Tables
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            print("🗑️ Clearing MSSQL Tables...")
            cursor.execute("TRUNCATE TABLE KnowledgeDocuments")
            cursor.execute("TRUNCATE TABLE DocumentLogs")
            cursor.execute("TRUNCATE TABLE QueryCache")
            cursor.execute("TRUNCATE TABLE AuditTrail")
            conn.commit()
            print("✅ MSSQL Tables cleared.")
        except Exception as e:
            print(f"❌ MSSQL Error: {e}")
        finally:
            conn.close()
    else:
        print("⚠️ MSSQL Connection failed. Tables not cleared.")

    print("\n✨ Knowledge Base is now EMPTY and CLEAN! ✨")
    print("Now you can upload your PDF again, and it will work perfectly.")

if __name__ == "__main__":
    wipe_everything()
