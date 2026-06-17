import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

# Database Config from .env
MSSQL_SERVER = os.getenv("MSSQL_SERVER")
MSSQL_DATABASE = os.getenv("MSSQL_DATABASE")
MSSQL_USER = os.getenv("MSSQL_USER")
MSSQL_PASS = os.getenv("MSSQL_PASS") or os.getenv("MSSQL_PASSWORD")

# ────────────────────────────────────────────────────────────
# 1. Add your Employee Numbers to the list below (I have added a few as examples)
# ────────────────────────────────────────────────────────────
EPF_LIST = [
    "2958", "2959", "2960", "2961","2966", # Add all 700 employee numbers here like this
]

DEFAULT_PASSWORD = "SDF@2025" # Common default password for everyone
DEFAULT_ROLE = "user"

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

import csv

def import_users():
    conn = get_db_connection()
    if not conn:
        print("ERROR: Could not connect to Database!")
        return

    cursor = conn.cursor()
    success_count = 0
    skip_count = 0

    users_to_add = [] # List of tuples: (epf, name)
    
    # Add hardcoded EPF_LIST with default names
    for epf in EPF_LIST:
        users_to_add.append((epf, f"Staff {epf}"))

    if os.path.exists("users.csv"):
        print("Reading from users.csv...")
        with open("users.csv", "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            for row in reader:
                if row and row[0].strip():
                    epf = row[0].strip()
                    if epf.lower() in ('epf', 'employee', 'id', 'emp_no'):
                        continue
                    name = row[1].strip() if len(row) > 1 and row[1].strip() else f"Staff {epf}"
                    users_to_add.append((epf, name))
    
    # Remove duplicates based on EPF
    unique_users = {}
    for epf, name in users_to_add:
        if epf not in unique_users:
            unique_users[epf] = name

    print(f"Starting import for {len(unique_users)} users...")

    for epf, name in unique_users.items():
        try:
            # Check if the user already exists in the database
            cursor.execute("SELECT COUNT(*) FROM Accounts WHERE Username = ?", epf)
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO Accounts (Username, Password, Role, Name, IsRegistered) VALUES (?, NULL, ?, ?, 0)",
                    epf, DEFAULT_ROLE, name
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
