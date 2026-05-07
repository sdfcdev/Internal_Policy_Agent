import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

# Database Config from .env
MSSQL_SERVER = os.getenv("MSSQL_SERVER")
MSSQL_DATABASE = os.getenv("MSSQL_DATABASE")
MSSQL_USER = os.getenv("MSSQL_USER")
MSSQL_PASS = os.getenv("MSSQL_PASSWORD")

# ────────────────────────────────────────────────────────────
# 1. පල්ලෙහා තියෙන List එකට ඔයාගේ EPF Numbers ටික දාන්න (උදාහරණ විදිහට මම කිහිපයක් දාලා ඇති)
# ────────────────────────────────────────────────────────────
EPF_LIST = [
    "2958", "2959", "2960", "2961","2966", # මේ වගේ ඔයාගේ 700 දෙනාගේම අංක මෙතනට දාන්න
]

DEFAULT_PASSWORD = "SDF@2025" # හැමෝටම දෙන පොදු පාස්වර්ඩ් එක
DEFAULT_ROLE = "staff"

def get_db_connection():
    drivers = ["{ODBC Driver 17 for SQL Server}", "{ODBC Driver 18 for SQL Server}", "{SQL Server}"]
    for driver in drivers:
        try:
            if MSSQL_USER and MSSQL_PASS:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};UID={MSSQL_USER};PWD={MSSQL_PASS};TrustServerCertificate=yes;"
            else:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;"
            return pyodbc.connect(conn_str)
        except: continue
    return None

def import_users():
    conn = get_db_connection()
    if not conn:
        print("ERROR: Could not connect to Database!")
        return

    cursor = conn.cursor()
    success_count = 0
    skip_count = 0

    print(f"Starting import for {len(EPF_LIST)} users...")

    for epf in EPF_LIST:
        try:
            # පරීක්ෂා කරනවා දැනටමත් ඉන්නවද කියලා
            cursor.execute("SELECT COUNT(*) FROM Accounts WHERE Username = ?", epf)
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO Accounts (Username, Password, Role, Name, IsRegistered) VALUES (?, NULL, ?, ?, 0)",
                    epf, DEFAULT_ROLE, f"Staff {epf}"
                )
                success_count += 1
            else:
                skip_count += 1
        except Exception as e:
            print(f"Error importing {epf}: {e}")

    conn.commit()
    conn.close()
    print(f"\nIMPORT COMPLETE!")
    print(f"✅ Successfully added: {success_count}")
    print(f"⚠️ Already existed: {skip_count}")
    print(f"\nNote: All new users can log in with password: {DEFAULT_PASSWORD}")

if __name__ == "__main__":
    import_users()
