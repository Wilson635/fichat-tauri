-- Boîtes mail FiEcho (indépendantes du chat).
CREATE TABLE IF NOT EXISTS mail_messages (
    id           BIGSERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder       VARCHAR(20) NOT NULL DEFAULT 'inbox', -- inbox | sent
    from_email   TEXT NOT NULL,
    to_email     TEXT NOT NULL,
    subject      TEXT NOT NULL DEFAULT '',
    body_text    TEXT NOT NULL DEFAULT '',
    message_id   TEXT,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_mailbox
    ON mail_messages (user_id, folder, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_messages_dedup
    ON mail_messages (user_id, message_id)
    WHERE message_id IS NOT NULL AND length(message_id) > 0;
