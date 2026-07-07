import pyodbc

print("Starting DB migration for Access Control Lists...")

conn_str = 'DRIVER={ODBC Driver 18 for SQL Server};SERVER=127.0.0.1;DATABASE=SDF_Copilot;UID=sa;PWD=BL@cKBe3rrY#EFc25;TrustServerCertificate=yes;'
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.columns 
                       WHERE Name = N'AllowedEmails' 
                       AND Object_ID = Object_ID(N'KnowledgeDocuments'))
        BEGIN
            ALTER TABLE KnowledgeDocuments ADD AllowedEmails NVARCHAR(MAX) NULL;
            print('Successfully added AllowedEmails column.');
        END
        ELSE
        BEGIN
            print('AllowedEmails column already exists.');
        END
    """)
    conn.commit()
    print("Migration completed successfully!")
except Exception as e:
    print(f"Error during migration: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
