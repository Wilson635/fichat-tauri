-- Comptes locaux (hors Active Directory)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_source VARCHAR(20) NOT NULL DEFAULT 'ad';

UPDATE users
SET auth_source = 'ad'
WHERE ldap_dn IS NOT NULL AND ldap_dn <> '';

CREATE INDEX IF NOT EXISTS idx_users_auth_source ON users(auth_source);

-- Journal runtime persisté sur le serveur de base (une ligne par événement)
CREATE TABLE IF NOT EXISTS runtime_log_lines (
    id         BIGSERIAL PRIMARY KEY,
    log_date   DATE NOT NULL,
    logged_at  TIMESTAMPTZ NOT NULL,
    level      VARCHAR(16) NOT NULL,
    target     TEXT NOT NULL,
    message    TEXT NOT NULL,
    host       TEXT
);

CREATE INDEX IF NOT EXISTS idx_runtime_log_lines_date ON runtime_log_lines(log_date, id);

-- Fichier journalier (contenu + statut d’écriture disque sur le serveur PG)
CREATE TABLE IF NOT EXISTS runtime_log_archives (
    log_date     DATE PRIMARY KEY,
    file_name    TEXT NOT NULL,
    contents     TEXT NOT NULL,
    byte_size    INT NOT NULL DEFAULT 0,
    server_path  TEXT,
    file_written BOOLEAN NOT NULL DEFAULT FALSE,
    write_error  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Écrit le journal du jour dans un fichier sur le serveur PostgreSQL (COPY TO).
-- Le répertoire doit exister et le rôle PG doit pouvoir écrire (superuser / pg_write_server_files).
CREATE OR REPLACE FUNCTION fiecho_write_log_file(p_path text, p_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_path IS NULL OR length(p_path) < 3 OR length(p_path) > 400 THEN
        RAISE EXCEPTION 'chemin journal invalide';
    END IF;
    IF p_path !~ '^[A-Za-z]:[/\\][A-Za-z0-9_ .\\/-]+$'
       AND p_path !~ '^/[A-Za-z0-9_./-]+$' THEN
        RAISE EXCEPTION 'chemin journal refusé';
    END IF;

    EXECUTE format(
        $c$COPY (
            SELECT logged_at::text || '  ' || rpad(level, 5) || ' [' || COALESCE(host, '-') || '] ' || target || ': ' || message
            FROM runtime_log_lines
            WHERE log_date = DATE %L
            ORDER BY id
        ) TO %L
        WITH (FORMAT text, ENCODING 'UTF8')$c$,
        p_date::text,
        p_path
    );
END;
$$;
