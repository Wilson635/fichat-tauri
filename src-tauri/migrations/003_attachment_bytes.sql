-- Store attachment bytes in PostgreSQL so every participant can download/preview
-- the file, not only the sender (whose local app_data path was previously stored).
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_data BYTEA;

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
