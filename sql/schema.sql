-- =====================================================================
-- RelevoApp (MySQL 8.0+)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS RelevoApp
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE RelevoApp;

-- Dedicated app user
-- Matches DB_USER/DB_PASSWORD in .env.
CREATE USER IF NOT EXISTS 'relevoapp'@'localhost' IDENTIFIED BY 'RelevoApp2026@';
GRANT ALL PRIVILEGES ON RelevoApp.* TO 'relevoapp'@'localhost';
FLUSH PRIVILEGES;

-- =====================================================================
-- Users
-- =====================================================================
CREATE TABLE Users
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    FirstName VARCHAR(100) NOT NULL,
    LastName VARCHAR(150) NOT NULL,
    Email VARCHAR(320) NOT NULL,
    PasswordHash LONGTEXT NOT NULL,
    Role VARCHAR(20) NOT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    UpdatedAt DATETIME(3) NULL,

    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT CK_Users_Role CHECK (Role IN ('ADMIN', 'USER'))
) ENGINE=InnoDB;

-- =====================================================================
-- Processes
-- =====================================================================
CREATE TABLE Processes
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    Name VARCHAR(200) NOT NULL,
    Description VARCHAR(2000) NULL,
    Status VARCHAR(20) NOT NULL,
    CurrentStepId CHAR(36) NULL,
    CreatedByUserId CHAR(36) NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    UpdatedAt DATETIME(3) NULL,
    StartedAt DATETIME(3) NULL,
    CompletedAt DATETIME(3) NULL,

    CONSTRAINT FK_Processes_CreatedByUser
        FOREIGN KEY (CreatedByUserId) REFERENCES Users(Id),

    CONSTRAINT CK_Processes_Status
        CHECK (Status IN ('DRAFT', 'ACTIVE', 'COMPLETED'))
) ENGINE=InnoDB;

-- =====================================================================
-- ProcessSteps
-- =====================================================================
CREATE TABLE ProcessSteps
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    ProcessId CHAR(36) NOT NULL,
    Position INT NOT NULL,
    AssigneeUserId CHAR(36) NOT NULL,
    Title VARCHAR(150) NOT NULL,
    Description VARCHAR(1000) NULL,
    ActionLabel VARCHAR(100) NOT NULL,
    Status VARCHAR(20) NOT NULL,
    CompletionCount INT NOT NULL DEFAULT 0,
    ActivatedAt DATETIME(3) NULL,
    CompletedAt DATETIME(3) NULL,
    CompletedByUserId CHAR(36) NULL,
    RejectionNote VARCHAR(1000) NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    UpdatedAt DATETIME(3) NULL,

    CONSTRAINT FK_ProcessSteps_Process
        FOREIGN KEY (ProcessId) REFERENCES Processes(Id),

    CONSTRAINT FK_ProcessSteps_AssigneeUser
        FOREIGN KEY (AssigneeUserId) REFERENCES Users(Id),

    CONSTRAINT FK_ProcessSteps_CompletedByUser
        FOREIGN KEY (CompletedByUserId) REFERENCES Users(Id),

    CONSTRAINT CK_ProcessSteps_Position CHECK (Position > 0),
    CONSTRAINT CK_ProcessSteps_Status CHECK (Status IN ('WAITING', 'PENDING', 'COMPLETED')),
    CONSTRAINT CK_ProcessSteps_CompletionCount CHECK (CompletionCount >= 0),
    CONSTRAINT UQ_ProcessSteps_Process_Position UNIQUE (ProcessId, Position)
) ENGINE=InnoDB;

-- Add the CurrentStepId foreign key (deferred: ProcessSteps didn't exist yet)
ALTER TABLE Processes
    ADD CONSTRAINT FK_Processes_CurrentStep
    FOREIGN KEY (CurrentStepId) REFERENCES ProcessSteps(Id);

-- =====================================================================
-- ProcessSubsteps
-- =====================================================================
CREATE TABLE ProcessSubsteps
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    ProcessStepId CHAR(36) NOT NULL,
    AssigneeUserId CHAR(36) NOT NULL,
    Title VARCHAR(150) NOT NULL,
    Description VARCHAR(1000) NULL,
    ActionLabel VARCHAR(100) NOT NULL,
    DisplayOrder INT NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL,
    CompletionCount INT NOT NULL DEFAULT 0,
    ActivatedAt DATETIME(3) NULL,
    CompletedAt DATETIME(3) NULL,
    CompletedByUserId CHAR(36) NULL,
    RejectionNote VARCHAR(1000) NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    UpdatedAt DATETIME(3) NULL,

    CONSTRAINT FK_ProcessSubsteps_ProcessStep
        FOREIGN KEY (ProcessStepId) REFERENCES ProcessSteps(Id),

    CONSTRAINT FK_ProcessSubsteps_AssigneeUser
        FOREIGN KEY (AssigneeUserId) REFERENCES Users(Id),

    CONSTRAINT FK_ProcessSubsteps_CompletedByUser
        FOREIGN KEY (CompletedByUserId) REFERENCES Users(Id),

    CONSTRAINT CK_ProcessSubsteps_Status CHECK (Status IN ('WAITING', 'PENDING', 'COMPLETED')),
    CONSTRAINT CK_ProcessSubsteps_CompletionCount CHECK (CompletionCount >= 0)
) ENGINE=InnoDB;

-- =====================================================================
-- ProcessEvents
-- =====================================================================
CREATE TABLE ProcessEvents
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    ProcessId CHAR(36) NOT NULL,
    ProcessStepId CHAR(36) NULL,
    ProcessSubstepId CHAR(36) NULL,
    ActorUserId CHAR(36) NOT NULL,
    EventType VARCHAR(50) NOT NULL,
    Metadata LONGTEXT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),

    CONSTRAINT FK_ProcessEvents_Process
        FOREIGN KEY (ProcessId) REFERENCES Processes(Id),

    CONSTRAINT FK_ProcessEvents_ProcessStep
        FOREIGN KEY (ProcessStepId) REFERENCES ProcessSteps(Id),

    CONSTRAINT FK_ProcessEvents_ProcessSubstep
        FOREIGN KEY (ProcessSubstepId) REFERENCES ProcessSubsteps(Id),

    CONSTRAINT FK_ProcessEvents_ActorUser
        FOREIGN KEY (ActorUserId) REFERENCES Users(Id),

    CONSTRAINT CK_ProcessEvents_EventType
        CHECK
        (
            EventType IN
            (
                'PROCESS_CREATED',
                'PROCESS_STARTED',
                'STEP_ACTIVATED',
                'STEP_COMPLETED',
                'STEP_REJECTED',
                'SUBSTEP_COMPLETED',
                'SUBSTEP_REJECTED',
                'PROCESS_COMPLETED'
            )
        )
) ENGINE=InnoDB;

-- =====================================================================
-- ProcessTemplates
-- =====================================================================
-- A reusable scaffold of steps/substeps (titles, descriptions, assignees)
-- saved from an existing process, so an admin can start a new process
-- pre-filled instead of rebuilding it from scratch. Templates carry no
-- runtime state (no Status/ActivatedAt/etc.) — they're a copy of the shape,
-- not a link back to the source process.
CREATE TABLE ProcessTemplates
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    Name VARCHAR(200) NOT NULL,
    CreatedByUserId CHAR(36) NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),

    CONSTRAINT FK_ProcessTemplates_CreatedByUser
        FOREIGN KEY (CreatedByUserId) REFERENCES Users(Id)
) ENGINE=InnoDB;

CREATE TABLE ProcessTemplateSteps
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    ProcessTemplateId CHAR(36) NOT NULL,
    Position INT NOT NULL,
    AssigneeUserId CHAR(36) NOT NULL,
    Title VARCHAR(150) NOT NULL,
    Description VARCHAR(1000) NULL,
    ActionLabel VARCHAR(100) NOT NULL,

    CONSTRAINT FK_ProcessTemplateSteps_Template
        FOREIGN KEY (ProcessTemplateId) REFERENCES ProcessTemplates(Id),

    CONSTRAINT FK_ProcessTemplateSteps_AssigneeUser
        FOREIGN KEY (AssigneeUserId) REFERENCES Users(Id),

    CONSTRAINT CK_ProcessTemplateSteps_Position CHECK (Position > 0),
    CONSTRAINT UQ_ProcessTemplateSteps_Template_Position UNIQUE (ProcessTemplateId, Position)
) ENGINE=InnoDB;

CREATE TABLE ProcessTemplateSubsteps
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    ProcessTemplateStepId CHAR(36) NOT NULL,
    AssigneeUserId CHAR(36) NOT NULL,
    Title VARCHAR(150) NOT NULL,
    Description VARCHAR(1000) NULL,
    ActionLabel VARCHAR(100) NOT NULL,
    DisplayOrder INT NOT NULL DEFAULT 0,

    CONSTRAINT FK_ProcessTemplateSubsteps_TemplateStep
        FOREIGN KEY (ProcessTemplateStepId) REFERENCES ProcessTemplateSteps(Id),

    CONSTRAINT FK_ProcessTemplateSubsteps_AssigneeUser
        FOREIGN KEY (AssigneeUserId) REFERENCES Users(Id)
) ENGINE=InnoDB;

-- =====================================================================
-- PasswordResetTokens
-- =====================================================================
-- Self-service "forgot password" flow. TokenHash stores a SHA-256 hex
-- digest of the raw token emailed to the user — the raw token is never
-- persisted, so a database dump alone can't be used to reset accounts.
CREATE TABLE PasswordResetTokens
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    UserId CHAR(36) NOT NULL,
    TokenHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME(3) NOT NULL,
    UsedAt DATETIME(3) NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),

    CONSTRAINT FK_PasswordResetTokens_User
        FOREIGN KEY (UserId) REFERENCES Users(Id),

    CONSTRAINT UQ_PasswordResetTokens_TokenHash UNIQUE (TokenHash)
) ENGINE=InnoDB;

-- =====================================================================
-- PushSubscriptions
-- =====================================================================
-- Web Push subscriptions (browser notifications). One row per
-- device/browser the user has opted in from. Endpoint is unique because
-- each browser push service issues its own endpoint per subscription.
-- Endpoint/P256dh/Auth are ASCII (URLs and URL-safe base64) — pinned to
-- the ascii charset so a UNIQUE index on Endpoint stays under InnoDB's
-- key-length limit (utf8mb4's 4 bytes/char would push VARCHAR(1000) past it).
CREATE TABLE PushSubscriptions
(
    Id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    UserId CHAR(36) NOT NULL,
    Endpoint VARCHAR(1000) CHARACTER SET ascii NOT NULL,
    P256dh VARCHAR(200) CHARACTER SET ascii NOT NULL,
    Auth VARCHAR(200) CHARACTER SET ascii NOT NULL,
    CreatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),

    CONSTRAINT FK_PushSubscriptions_User
        FOREIGN KEY (UserId) REFERENCES Users(Id),

    CONSTRAINT UQ_PushSubscriptions_Endpoint UNIQUE (Endpoint)
) ENGINE=InnoDB;
