import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()

MSSQL_SERVER   = os.getenv("MSSQL_SERVER", "localhost")
MSSQL_DATABASE = os.getenv("MSSQL_DATABASE", "SDF_Copilot_DB") # Or SDF_Copilot based on your error
MSSQL_USER     = os.getenv("MSSQL_USER", "")
MSSQL_PASS     = os.getenv("MSSQL_PASS", "")

def fix_db():
    drivers = [
        '{ODBC Driver 18 for SQL Server}',
        '{ODBC Driver 17 for SQL Server}',
        '{SQL Server Native Client 11.0}',
        '{SQL Server}'
    ]
    
    conn = None
    for driver in drivers:
        try:
            if MSSQL_USER and MSSQL_PASS:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};UID={MSSQL_USER};PWD={MSSQL_PASS};TrustServerCertificate=yes;"
            else:
                conn_str = f"DRIVER={driver};SERVER={MSSQL_SERVER};DATABASE={MSSQL_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;"
            
            print(f"Trying driver {driver}...")
            conn = pyodbc.connect(conn_str, timeout=5)
            print("Connected successfully!")
            break
        except Exception as e:
            continue
            
    if not conn:
        print("Failed to connect to the database.")
        return

    try:
        cursor = conn.cursor()
        print("Increasing Department column size to VARCHAR(MAX)...")
        # Ensure we use the correct database name from the error
        cursor.execute("USE SDF_Copilot;") 
        cursor.execute("ALTER TABLE Accounts ALTER COLUMN Department VARCHAR(MAX);")
        conn.commit()
        print("Success! Database column updated.")
    except Exception as e:
        print(f"Error executing query: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    fix_db()
