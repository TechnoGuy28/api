-- Schema do banco de dados PostgreSQL (Neon) para o sistema de gestao de estoque de publicacoes.
-- Este script e de propriedade da API Node.js (unica camada que acessa o banco).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================ USERS ============================
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    password_hash TEXT          NOT NULL,
    phone         VARCHAR(20),
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_name ON users (LOWER(name));

-- ============================ CATEGORIES ============================
CREATE TABLE IF NOT EXISTS categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name ON categories (LOWER(name));

-- ============================ PUBLICATIONS ============================
CREATE TABLE IF NOT EXISTS publications (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR(160) NOT NULL,
    code         VARCHAR(60)  NOT NULL,
    category_id  BIGINT       REFERENCES categories(id) ON DELETE RESTRICT,
    image_path   VARCHAR(255),
    status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive')),
    quantity     INTEGER      NOT NULL DEFAULT 0
                   CHECK (quantity >= 0),
    created_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_publications_code ON publications (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_publications_category ON publications (category_id);
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications (status);
CREATE INDEX IF NOT EXISTS idx_publications_deleted ON publications (deleted_at);

-- ============================ STOCK_MOVEMENTS ============================
CREATE TABLE IF NOT EXISTS stock_movements (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    publication_id    BIGINT       NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    user_id           BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    type              VARCHAR(20)  NOT NULL
                      CHECK (type IN ('in', 'out', 'adjust')),
    quantity          INTEGER      NOT NULL CHECK (quantity > 0),
    previous_quantity INTEGER      NOT NULL,
    resulting_quantity INTEGER     NOT NULL,
    note              TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movements_publication ON stock_movements (publication_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements (created_at);

-- ============================ AUDIT_LOGS ============================
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(60)  NOT NULL,
    entity_type VARCHAR(40)  NOT NULL,
    entity_id   BIGINT,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);

-- ============================ SETTINGS ============================
CREATE TABLE IF NOT EXISTS settings (
    key        VARCHAR(60)  PRIMARY KEY,
    value      TEXT,
    updated_by BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================ MONTHLY_REPORTS ============================
CREATE TABLE IF NOT EXISTS monthly_reports (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference_month VARCHAR(7) NOT NULL,  -- formato YYYY-MM
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    file_path      VARCHAR(255),
    type           VARCHAR(20) NOT NULL DEFAULT 'monthly'
                    CHECK (type IN ('monthly', 'manual')),
    metadata       JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_month ON monthly_reports (reference_month, type);
CREATE INDEX IF NOT EXISTS idx_reports_generated ON monthly_reports (generated_at);
