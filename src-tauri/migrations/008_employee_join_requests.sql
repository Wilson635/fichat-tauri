-- Source d’appartenance + demandes d’adhésion (admins FiEcho, pas admins de groupe).
ALTER TABLE group_members
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS group_join_requests (
    id           SERIAL PRIMARY KEY,
    group_id     INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  INT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_join_requests_pending
    ON group_join_requests (status, created_at DESC)
    WHERE status = 'pending';
