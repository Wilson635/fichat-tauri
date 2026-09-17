-- Journal scellé : les colonnes message/level/target ne portent plus le texte clair.
-- Les fichiers COPY TO n’écrivent que des enveloppes FJE2.

ALTER TABLE runtime_log_archives ADD COLUMN IF NOT EXISTS sealed BOOLEAN NOT NULL DEFAULT FALSE;

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
            SELECT message
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
