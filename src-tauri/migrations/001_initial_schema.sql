-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(100) NOT NULL UNIQUE,
    display_name     VARCHAR(255) NOT NULL,
    email            VARCHAR(255),
    department       VARCHAR(255),
    title            VARCHAR(255),
    phone            VARCHAR(100),
    avatar_path      TEXT,
    role             VARCHAR(50)  NOT NULL DEFAULT 'user',   -- 'user' | 'system_admin'
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    status_message   TEXT,
    presence_status  VARCHAR(50)  NOT NULL DEFAULT 'offline', -- 'online' | 'away' | 'busy' | 'offline'
    last_seen        TIMESTAMPTZ,
    ldap_dn          TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Groups ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    avatar_path  TEXT,
    created_by   INT REFERENCES users(id) ON DELETE SET NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Group members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
    group_id   INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL DEFAULT 'member', -- 'admin' | 'member'
    added_by   INT REFERENCES users(id) ON DELETE SET NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- ─── Conversations ────────────────────────────────────────────────────────────
-- A conversation is either direct (2 users) or a group conversation
CREATE TABLE IF NOT EXISTS conversations (
    id           SERIAL PRIMARY KEY,
    type         VARCHAR(20) NOT NULL,  -- 'direct' | 'group'
    group_id     INT REFERENCES groups(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id  INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id          INT NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
    joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- ─── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id               SERIAL PRIMARY KEY,
    conversation_id  INT  NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id        INT  REFERENCES users(id) ON DELETE SET NULL,
    content          TEXT,
    message_type     VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text' | 'image' | 'file' | 'system'
    reply_to_id      INT  REFERENCES messages(id) ON DELETE SET NULL,
    is_edited        BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    is_priority      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS message_status (
    message_id  INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'sent', -- 'sent' | 'delivered' | 'read'
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

-- ─── Attachments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
    id           SERIAL PRIMARY KEY,
    message_id   INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name    VARCHAR(500) NOT NULL,
    file_path    TEXT NOT NULL,
    file_type    VARCHAR(100),
    file_size    BIGINT,
    thumbnail    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Audit Logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    actor_id     INT REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(100) NOT NULL,
    target_type  VARCHAR(100),
    target_id    INT,
    details      JSONB,
    ip_address   VARCHAR(50),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AD Sync History ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_history (
    id              SERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    users_added     INT NOT NULL DEFAULT 0,
    users_disabled  INT NOT NULL DEFAULT 0,
    users_updated   INT NOT NULL DEFAULT 0,
    status          VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error'
    error_message   TEXT,
    triggered_by    INT REFERENCES users(id) ON DELETE SET NULL
);

-- ─── User presence ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_presence (
    user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(50) NOT NULL DEFAULT 'offline',
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor      ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created    ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_username        ON users(username);
CREATE INDEX IF NOT EXISTS idx_group_members_user    ON group_members(user_id);
