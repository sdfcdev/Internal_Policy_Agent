import pyodbc
import bcrypt
import os
from dotenv import load_dotenv

load_dotenv()

# Database Connection (Same as main.py)
SERVER = os.getenv("DB_SERVER", "172.16.24.110")
DATABASE = os.getenv("DB_NAME", "SDF_Copilot")
USER = os.getenv("DB_USER", "copilot")
PASSWORD = os.getenv("DB_PASS", "c0p!L0t2026")

try:
    conn_str = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={SERVER};DATABASE={DATABASE};UID={USER};PWD={PASSWORD};TrustServerCertificate=yes;"
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()

    # The new password
    new_password = "Bl@c3B00T6y"
    
    # Hash the new password using bcrypt
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Update the master admin's password in the Accounts table
    cursor.execute("""
        UPDATE Accounts 
        SET PasswordHash = ?
        WHERE Username = 'master' OR Role = 'master'
    """, (hashed_password,))

    conn.commit()
    print("Success! Master admin password has been updated to Bl@c3B00T6y")

except Exception as e:
    print(f"Error updating password: {e}")
finally:
    if 'conn' in locals():
        conn.close()
