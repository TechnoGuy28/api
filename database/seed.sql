-- Seed inicial do banco. Cria uma categoria padrao e um usuario administrador.
-- A senha abaixo e temporaria: altere no primeiro acesso.
-- Senha do exemplo: "admin123" (hash bcrypt de admin123, verificada com bcrypt.compareSync).

INSERT INTO categories (name, active)
SELECT 'Geral', TRUE
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE LOWER(name) = 'geral');

-- Usuario inicial: nome "admin", senha "admin123".
-- Em producao, remova este insert ou altere a senha imediatamente.
DO $$
DECLARE
    v_hash TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE LOWER(name) = 'admin') THEN
        -- hash bcrypt valido de "admin123" (custo 10)
        v_hash := '$2a$10$jj/PF40JjOyi/HKd4S2Uxe/oC6/TNP3lCWjpFlQuiW4uKFi.2dUuW';
        INSERT INTO users (name, password_hash, phone, active)
        VALUES ('admin', v_hash, NULL, TRUE);
    END IF;
END $$;

-- Configuracao de fechamento mensal padrao: dia 1.
INSERT INTO settings (key, value, updated_at)
VALUES ('closing_day', '1', NOW())
ON CONFLICT (key) DO NOTHING;

-- ============================ USUARIO TOTAL ============================
-- "Tulio" e o UNICO usuario com papel 'total'. Se ainda nao existir, cria com
-- senha temporaria (admin123) para o primeiro acesso; em seguida garante o papel.
DO $$
DECLARE
    v_hash TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE LOWER(name) = 'tulio') THEN
        v_hash := '$2a$10$jj/PF40JjOyi/HKd4S2Uxe/oC6/TNP3lCWjpFlQuiW4uKFi.2dUuW';
        INSERT INTO users (name, password_hash, phone, active, role)
        VALUES ('Tulio', v_hash, NULL, TRUE, 'total');
    END IF;
    UPDATE users SET role = 'total' WHERE LOWER(name) = 'tulio';
END $$;
