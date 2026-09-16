-- File d'attente des e-mails applicatifs (indépendante du chat FiEcho).
CREATE TABLE IF NOT EXISTS mail_outbox (
    id            BIGSERIAL PRIMARY KEY,
    to_email      TEXT NOT NULL,
    subject       TEXT NOT NULL,
    body          TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed
    attempts      INT NOT NULL DEFAULT 0,
    last_error    TEXT,
    used_relay    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at       TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_outbox_pending
    ON mail_outbox (status, next_retry_at)
    WHERE status = 'pending';
