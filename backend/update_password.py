import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import get_db_connection, hash_password

def update_master_password():
    print("Attempting to connect to database using main.py credentials...")
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database. Check your MSSQL variables.")
        sys.exit(1)

    try:
        cursor = conn.cursor()
        
        # Hash the new password using the exact same function from main.py
        new_password = "Bl@c3B00T6y"
        hashed_password = hash_password(new_password)
        
        # Update the master admin's password
        cursor.execute("""
            UPDATE Accounts 
            SET Password = ?
            WHERE Role = 'master' OR Username = 'master_admin'
        """, (hashed_password,))
        
        conn.commit()
        print(f"Success! Master admin password has been updated to {new_password}")
        
    except Exception as e:
        print(f"Error updating password: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    update_master_password()
