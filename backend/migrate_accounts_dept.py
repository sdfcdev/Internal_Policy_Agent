import pyodbc

print("Starting DB migration for Accounts Department column...")

conn_str = 'DRIVER={ODBC Driver 18 for SQL Server};SERVER=127.0.0.1;DATABASE=SDF_Copilot;UID=sa;PWD=BL@cKBe3rrY#EFc25;TrustServerCertificate=yes;'
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Check if column exists in Accounts
    cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.columns 
                       WHERE Name = N'Department' 
                       AND Object_ID = Object_ID(N'Accounts'))
        BEGIN
            ALTER TABLE Accounts ADD Department NVARCHAR(255) NULL;
            print('Successfully added Department column to Accounts.');
        END
        ELSE
        BEGIN
            print('Department column already exists in Accounts.');
        END
    """)
    conn.commit()
    print("Migration completed successfully!")
except Exception as e:
    print(f"Error during migration: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
