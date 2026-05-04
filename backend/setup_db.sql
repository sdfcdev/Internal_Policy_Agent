-- ============================================================
--  SDF AI Copilot – MSSQL Database Setup Script
--  Run this in SQL Server Management Studio (SSMS) or sqlcmd
--  against your local SQL Express instance.
-- ============================================================

-- 1. Create the database (skip if it already exists)
IF NOT EXISTS (
    SELECT name FROM sys.databases WHERE name = N'SDF_Copilot'
)
BEGIN
    CREATE DATABASE SDF_Copilot;
    PRINT 'Database SDF_Copilot created.';
END
ELSE
BEGIN
    PRINT 'Database SDF_Copilot already exists – skipping creation.';
END
GO

USE SDF_Copilot;
GO

-- 2. Create the Accounts table
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name = 'Accounts' AND xtype = 'U'
)
BEGIN
    CREATE TABLE dbo.Accounts (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        Username    NVARCHAR(100)   NOT NULL UNIQUE,
        Password    NVARCHAR(200)   NOT NULL,
        Role        NVARCHAR(50)    NOT NULL, -- 'master', 'admin', 'user', 'subadmin'
        Name        NVARCHAR(150)   NULL,
        EmpNum      NVARCHAR(100)   NULL,
        Designation NVARCHAR(150)   NULL,
        Department  NVARCHAR(150)   NULL,
        CreatedAt   DATETIME        DEFAULT GETDATE()
    );

    PRINT 'Table Accounts created successfully.';
END
ELSE
BEGIN
    PRINT 'Table Accounts already exists – skipping creation.';
END
GO

-- Create Master Admin if Accounts table is empty
IF NOT EXISTS (SELECT 1 FROM dbo.Accounts)
BEGIN
    INSERT INTO dbo.Accounts (Username, Password, Role, Name, EmpNum) 
    VALUES ('master_admin', 'admin123', 'master', 'Master Admin', 'SYS-0000');
    PRINT 'Inserted default Master Admin (Username: master_admin, Password: admin123)';
END
GO

-- 3. Create the AuditTrail table
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name = 'AuditTrail' AND xtype = 'U'
)
BEGIN
    CREATE TABLE dbo.AuditTrail (
        ID          INT           IDENTITY(1,1) PRIMARY KEY,
        EmployeeID  NVARCHAR(100) NOT NULL,
        SessionID   NVARCHAR(100) NULL,
        QueryText   NVARCHAR(MAX) NOT NULL,
        AIResponse  NVARCHAR(MAX) NOT NULL,
        IsSaved     BIT           DEFAULT 0,
        IsPinned    BIT           DEFAULT 0,
        CreatedAt   DATETIME      NOT NULL DEFAULT GETDATE()
    );

    -- Index for fast employee lookups
    CREATE NONCLUSTERED INDEX IX_AuditTrail_EmployeeID
        ON dbo.AuditTrail (EmployeeID);

    PRINT 'Table AuditTrail created successfully.';
END
ELSE
BEGIN
    -- Add missing columns if upgrading from old version
    IF COL_LENGTH('AuditTrail', 'SessionID') IS NULL
        ALTER TABLE dbo.AuditTrail ADD SessionID NVARCHAR(100) NULL, IsSaved BIT DEFAULT 0, IsPinned BIT DEFAULT 0;
        
    PRINT 'Table AuditTrail already exists – updated schema if needed.';
END
GO

-- 4. Create DocumentLogs table
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name = 'DocumentLogs' AND xtype = 'U'
)
BEGIN
    CREATE TABLE dbo.DocumentLogs (
        ID          INT            IDENTITY(1,1) PRIMARY KEY,
        AdminID     NVARCHAR(100)  NULL,
        Action      NVARCHAR(50)   NOT NULL,
        Filename    NVARCHAR(255)  NOT NULL,
        ChunksCount INT            NOT NULL,
        CreatedAt   DATETIME       NOT NULL DEFAULT GETDATE()
    );

    PRINT 'Table DocumentLogs created successfully.';
END
ELSE
BEGIN
    IF COL_LENGTH('DocumentLogs', 'AdminID') IS NULL
        ALTER TABLE dbo.DocumentLogs ADD AdminID NVARCHAR(100) NULL;
    PRINT 'Table DocumentLogs already exists – updated schema if needed.';
END
GO

-- 5. Create KnowledgeDocuments
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='KnowledgeDocuments' AND xtype='U'
)
BEGIN
    CREATE TABLE dbo.KnowledgeDocuments (
        ID          INT            IDENTITY(1,1) PRIMARY KEY,
        Filename    NVARCHAR(255)  NOT NULL,
        StartDate   NVARCHAR(100)  NULL,
        ExpireDate  NVARCHAR(100)  NULL,
        AdminID     NVARCHAR(100)  NULL,
        CreatedAt   DATETIME       NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Table KnowledgeDocuments created successfully.';
END
ELSE
BEGIN
    PRINT 'Table KnowledgeDocuments already exists.';
END
GO

-- 6. Create QueryCache
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='QueryCache' AND xtype='U'
)
BEGIN
    CREATE TABLE dbo.QueryCache (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        QueryText   NVARCHAR(MAX)   NOT NULL,
        AIResponse  NVARCHAR(MAX)   NOT NULL,
        Accuracy    NVARCHAR(50)    NOT NULL,
        CreatedAt   DATETIME        DEFAULT GETDATE()
    );
    PRINT 'Table QueryCache created successfully.';
END
ELSE
BEGIN
    PRINT 'Table QueryCache already exists.';
END
GO

-- Clean up obsolete table if present (optional)
IF EXISTS (SELECT * FROM sysobjects WHERE name='SubAdmins' AND xtype='U')
BEGIN
    DROP TABLE dbo.SubAdmins;
    PRINT 'Dropped obsolete SubAdmins table. Using Accounts instead.';
END
GO

PRINT '=== SDF_Copilot database setup complete ===';
