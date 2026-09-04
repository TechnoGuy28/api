-- Schema do banco de dados PostgreSQL (Neon) para o sistema de gestao de estoque de publicacoes.
-- Este script e de propriedade da API Node.js (unica camada que acessa o banco).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================ USERS ============================
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    password_hash TEXT          NOT NULL,
    phone         VARCHAR(20),
    -- Papel de acesso: leitor (somente visualizar/imprimir), master (opera a
    -- plataforma) e total (unico: conta "Tulio" com todos os privilegios).
    role          VARCHAR(20)  NOT NULL DEFAULT 'master'
                    CHECK (role IN ('leitor', 'master', 'total')),
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_name ON users (LOWER(name));

-- Migracao idempotente para bancos criados antes do papel: adiciona a coluna
-- se ainda nao existir. Usuarios existentes passam a ser 'master' (mantem o
-- acesso atual); apenas "Tulio" recebe 'total' (ver seed.sql).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'master'
    CHECK (role IN ('leitor', 'master', 'total'));

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
    -- Quantidade em exposicao (separada do estoque). O total disponivel e quantity + exposure_quantity.
    exposure_quantity INTEGER  NOT NULL DEFAULT 0
                   CHECK (exposure_quantity >= 0),
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
-- Tipos de movimentacao:
--   'in'           entrada (soma no estoque)
--   'out'          saida (desconta da exposicao; requer exposicao suficiente)
--   'to_exposure'  do estoque para a exposicao
--   'to_stock'     da exposicao para o estoque
CREATE TABLE IF NOT EXISTS stock_movements (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    publication_id    BIGINT       NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    user_id           BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    type              VARCHAR(20)  NOT NULL
                      CHECK (type IN ('in', 'out', 'to_exposure', 'to_stock')),
    quantity          INTEGER      NOT NULL CHECK (quantity > 0),
    previous_quantity INTEGER      NOT NULL,
    resulting_quantity INTEGER     NOT NULL,
    previous_exposure INTEGER      NOT NULL DEFAULT 0,
    resulting_exposure INTEGER     NOT NULL DEFAULT 0,
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

-- ============================ GENERATED_PDFS ============================
-- Historico de documentos PDF gerados pelo sistema (relatorio geral, mensal,
-- dashboard, publicacoes, auditoria). O arquivo fisico fica no host PHP
-- (storage/reports); a API apenas registra a referencia para visualizacao/exclusao.
CREATE TABLE IF NOT EXISTS generated_pdfs (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind             VARCHAR(40)  NOT NULL,
    title            VARCHAR(160) NOT NULL,
    file_path        VARCHAR(255) NOT NULL,
    reference_period VARCHAR(20),
    generated_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    generated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_kind ON generated_pdfs (kind);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_generated ON generated_pdfs (generated_at DESC);

-- ============================ CLOSINGS ============================
-- Fechamento de estoque: a cada fechamento (ex.: ao gerar o relatorio mensal)
-- armazenamos o saldo de cada publicacao NAQUELE momento. Isso permite que os
-- relatorios apresentem "saldo anterior" (apos o fechamento anterior) e o
-- "ultimo fechamento" com data/hora exatos.
CREATE TABLE IF NOT EXISTS closings (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference_month VARCHAR(7),
    closed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'monthly'
                    CHECK (type IN ('monthly', 'manual'))
);
CREATE INDEX IF NOT EXISTS idx_closings_closed ON closings (closed_at DESC);

CREATE TABLE IF NOT EXISTS closing_items (
    closing_id     BIGINT       NOT NULL REFERENCES closings(id) ON DELETE CASCADE,
    publication_id BIGINT       NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    quantity       INTEGER      NOT NULL DEFAULT 0,
    exposure_quantity INTEGER   NOT NULL DEFAULT 0,
    PRIMARY KEY (closing_id, publication_id)
);
CREATE INDEX IF NOT EXISTS idx_closing_items_pub ON closing_items (publication_id);

-- ==================== MIGRACOES IDEMPOTENTES (bancos existentes) ====================
-- Adicionam colunas e ajustam constraints sem quebrar instalacoes anteriores.

-- Publicacoes: coluna de exposicao (bancos criados antes da feature).
ALTER TABLE publications ADD COLUMN IF NOT EXISTS exposure_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (exposure_quantity >= 0);

-- Movimentacoes: campos de exposicao (antes/depois) para bancos antigos.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS previous_exposure INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS resulting_exposure INTEGER NOT NULL DEFAULT 0;

-- Fechamentos: saldo de exposicao nos snapshots.
ALTER TABLE closing_items ADD COLUMN IF NOT EXISTS exposure_quantity INTEGER NOT NULL DEFAULT 0;

-- CHECK de tipo das movimentacoes: remove a versao antiga (com 'adjust') e adiciona a nova.
-- Aplicar embora o banco ja tenha a constraint nova e seguro (IF EXISTS + sem duplicar).
DO $$
BEGIN
    -- Limpa a constraint antiga se existir (nome gerado automaticamente).
    ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
        CHECK (type IN ('in', 'out', 'to_exposure', 'to_stock'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
