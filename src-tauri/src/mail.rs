//! Envoi SMTP applicatif (Zimbra + relais de secours) avec file d’attente.
//! N’interfère pas avec le chat FiEcho.

use crate::config::AppConfig;
use chrono::{Duration, Utc};
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::Tls;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use sqlx::PgPool;
use std::sync::{Mutex, OnceLock};
use std::time::Duration as StdDuration;

#[derive(Clone, Debug)]
struct Relay {
    host: String,
    port: u16,
    security: String,
    username: String,
    password: String,
}

struct Backend {
    pool: Option<PgPool>,
    from: String,
    primary: Relay,
    backup: Option<Relay>,
}

static BACKEND: OnceLock<Mutex<Backend>> = OnceLock::new();
static WORKER: OnceLock<()> = OnceLock::new();

fn backend() -> &'static Mutex<Backend> {
    BACKEND.get_or_init(|| {
        Mutex::new(Backend {
            pool: None,
            from: String::new(),
            primary: Relay {
                host: String::new(),
                port: 587,
                security: "starttls".into(),
                username: String::new(),
                password: String::new(),
            },
            backup: None,
        })
    })
}

pub fn init_worker() {
    if WORKER.set(()).is_err() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(StdDuration::from_secs(45));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            flush_pending().await;
        }
    });
}

pub fn set_backend(pool: PgPool, cfg: &AppConfig) {
    let inbound_pool = pool.clone();
    if let Ok(mut b) = backend().lock() {
        b.pool = Some(pool);
        b.from = cfg.smtp_from.clone();
        b.primary = Relay {
            host: cfg.smtp_host.trim().to_string(),
            port: if cfg.smtp_port == 0 { 587 } else { cfg.smtp_port },
            security: cfg.smtp_security.clone(),
            username: cfg.smtp_username.clone(),
            password: cfg.smtp_password.clone(),
        };
        let backup_host = cfg.smtp_backup_host.trim().to_string();
        b.backup = if backup_host.is_empty() {
            None
        } else {
            Some(Relay {
                host: backup_host,
                port: if cfg.smtp_backup_port == 0 {
                    587
                } else {
                    cfg.smtp_backup_port
                },
                security: cfg.smtp_backup_security.clone(),
                username: cfg.smtp_backup_username.clone(),
                password: cfg.smtp_backup_password.clone(),
            })
        };
    }
    crate::mail_inbound::configure(
        inbound_pool,
        cfg.smtp_inbound_enabled,
        cfg.smtp_inbound_bind.clone(),
        cfg.smtp_inbound_domain.clone(),
    );
}

fn snapshot() -> Option<(PgPool, String, Relay, Option<Relay>)> {
    let b = backend().lock().ok()?;
    Some((
        b.pool.clone()?,
        b.from.clone(),
        b.primary.clone(),
        b.backup.clone(),
    ))
}

pub async fn send_now(to: &str, subject: &str, body: &str) -> Result<String, String> {
    let (_, from, primary, backup) = snapshot().ok_or("Service mail non initialisé")?;
    deliver(&from, to, subject, body, &primary, backup.as_ref()).await
}

pub async fn enqueue(pool: &PgPool, to: &str, subject: &str, body: &str) -> Result<i64, String> {
    sqlx::query_scalar(
        r#"
        INSERT INTO mail_outbox (to_email, subject, body, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING id
        "#,
    )
    .bind(to)
    .bind(subject)
    .bind(body)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("File d’attente mail : {e}"))
}

async fn flush_pending() {
    let Some((pool, from, primary, backup)) = snapshot() else {
        return;
    };
    if primary.host.is_empty() {
        return;
    }
    let rows = sqlx::query(
        r#"
        SELECT id, to_email, subject, body, attempts
        FROM mail_outbox
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY id
        LIMIT 20
        "#,
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for row in rows {
        use sqlx::Row;
        let id: i64 = row.try_get("id").unwrap_or(0);
        let to: String = row.try_get("to_email").unwrap_or_default();
        let subject: String = row.try_get("subject").unwrap_or_default();
        let body: String = row.try_get("body").unwrap_or_default();
        let attempts: i32 = row.try_get("attempts").unwrap_or(0);

        match deliver(&from, &to, &subject, &body, &primary, backup.as_ref()).await {
            Ok(relay) => {
                let _ = sqlx::query(
                    r#"
                    UPDATE mail_outbox
                    SET status = 'sent', sent_at = NOW(), used_relay = $2, last_error = NULL, attempts = attempts + 1
                    WHERE id = $1
                    "#,
                )
                .bind(id)
                .bind(&relay)
                .execute(&pool)
                .await;
            }
            Err(err) => {
                let next = Utc::now() + Duration::minutes(i64::from((attempts + 1).min(30) * 2));
                let failed = attempts + 1 >= 12;
                let _ = sqlx::query(
                    r#"
                    UPDATE mail_outbox
                    SET attempts = attempts + 1,
                        last_error = $2,
                        next_retry_at = $3,
                        status = $4
                    WHERE id = $1
                    "#,
                )
                .bind(id)
                .bind(&err)
                .bind(next)
                .bind(if failed { "failed" } else { "pending" })
                .execute(&pool)
                .await;
                tracing::warn!("Mail #{id} non envoyé: {err}");
            }
        }
    }
}

async fn deliver(
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
    primary: &Relay,
    backup: Option<&Relay>,
) -> Result<String, String> {
    if primary.host.is_empty() {
        return Err("SMTP principal (Zimbra) non configuré.".into());
    }
    match send_via(primary, from, to, subject, body).await {
        Ok(()) => Ok(format!("{}:{}", primary.host, primary.port)),
        Err(primary_err) => {
            if let Some(backup) = backup.filter(|r| !r.host.is_empty()) {
                match send_via(backup, from, to, subject, body).await {
                    Ok(()) => {
                        tracing::warn!(
                            "SMTP Zimbra injoignable ({primary_err}) — envoi via le relais de secours {}",
                            backup.host
                        );
                        Ok(format!("{}:{}", backup.host, backup.port))
                    }
                    Err(backup_err) => Err(format!("Zimbra: {primary_err} · secours: {backup_err}")),
                }
            } else {
                Err(format!(
                    "{primary_err} (aucun SMTP de secours — le message reste en file d’attente)"
                ))
            }
        }
    }
}

async fn send_via(
    relay: &Relay,
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let from_mb: Mailbox = from
        .parse()
        .map_err(|_| format!("Adresse d’expéditeur invalide: {from}"))?;
    let to_mb: Mailbox = to
        .parse()
        .map_err(|_| format!("Adresse destinataire invalide: {to}"))?;

    let email = Message::builder()
        .from(from_mb)
        .to(to_mb)
        .subject(subject)
        .body(body.to_string())
        .map_err(|e| format!("Composition du message: {e}"))?;

    let mailer = build_transport(relay)?;
    mailer
        .send(email)
        .await
        .map_err(|e| format!("{}:{} — {e}", relay.host, relay.port))?;
    Ok(())
}

fn build_transport(relay: &Relay) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let timeout = Some(StdDuration::from_secs(12));
    let security = relay.security.to_ascii_lowercase();
    let mut builder = match security.as_str() {
        "ssl" | "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&relay.host)
            .map_err(|e| format!("Relais SSL {}: {e}", relay.host))?,
        "none" => {
            let mut b = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&relay.host)
                .port(relay.port)
                .timeout(timeout)
                .tls(Tls::None);
            if !relay.username.trim().is_empty() {
                b = b.credentials(Credentials::new(
                    relay.username.clone(),
                    relay.password.clone(),
                ));
            }
            return Ok(b.build());
        }
        _ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&relay.host)
            .map_err(|e| format!("Relais STARTTLS {}: {e}", relay.host))?,
    };
    builder = builder.port(relay.port).timeout(timeout);
    if !relay.username.trim().is_empty() {
        builder = builder.credentials(Credentials::new(
            relay.username.clone(),
            relay.password.clone(),
        ));
    }
    Ok(builder.build())
}

pub async fn list_outbox(pool: &PgPool, limit: i64) -> Result<Vec<OutboxRow>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, to_email, subject, status, attempts, last_error, used_relay, created_at, sent_at
        FROM mail_outbox
        ORDER BY id DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("File d’attente mail : {e}"))?;

    use sqlx::Row;
    Ok(rows
        .into_iter()
        .map(|row| OutboxRow {
            id: row.try_get("id").unwrap_or(0),
            to_email: row.try_get("to_email").unwrap_or_default(),
            subject: row.try_get("subject").unwrap_or_default(),
            status: row.try_get("status").unwrap_or_default(),
            attempts: row.try_get("attempts").unwrap_or(0),
            last_error: row.try_get("last_error").ok().flatten(),
            used_relay: row.try_get("used_relay").ok().flatten(),
            created_at: row
                .try_get::<chrono::DateTime<Utc>, _>("created_at")
                .ok()
                .map(|d| d.to_rfc3339())
                .unwrap_or_default(),
            sent_at: row
                .try_get::<Option<chrono::DateTime<Utc>>, _>("sent_at")
                .ok()
                .flatten()
                .map(|d| d.to_rfc3339()),
        })
        .collect())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxRow {
    pub id: i64,
    pub to_email: String,
    pub subject: String,
    pub status: String,
    pub attempts: i32,
    pub last_error: Option<String>,
    pub used_relay: Option<String>,
    pub created_at: String,
    pub sent_at: Option<String>,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    pub id: i64,
    pub folder: String,
    pub from_email: String,
    pub to_email: String,
    pub subject: String,
    pub body_text: String,
    pub is_read: bool,
    pub created_at: String,
}

pub fn normalize_email(raw: &str) -> String {
    let s = raw.trim();
    let inner = if let (Some(a), Some(b)) = (s.find('<'), s.rfind('>')) {
        if b > a {
            &s[a + 1..b]
        } else {
            s
        }
    } else {
        s
    };
    inner.trim().trim_matches(|c| c == '"' || c == '\'').to_ascii_lowercase()
}

pub fn split_recipients(raw: &str) -> Vec<String> {
    raw.split(|c| c == ',' || c == ';')
        .map(normalize_email)
        .filter(|s| s.contains('@'))
        .collect()
}

pub async fn find_local_user(
    pool: &PgPool,
    email: &str,
    domain: &str,
) -> Result<Option<i32>, String> {
    let addr = normalize_email(email);
    if addr.is_empty() || !addr.contains('@') {
        return Ok(None);
    }
    let local = addr.split('@').next().unwrap_or("").to_string();
    let addr_domain = addr.split('@').nth(1).unwrap_or("").to_string();
    let domain = domain.trim().to_ascii_lowercase();

    let row = sqlx::query(
        r#"
        SELECT id FROM users
        WHERE is_active = TRUE
          AND (
            lower(email) = $1
            OR (
                lower(username) = $2
                AND $3 = $4
            )
          )
        ORDER BY CASE WHEN lower(email) = $1 THEN 0 ELSE 1 END
        LIMIT 1
        "#,
    )
    .bind(&addr)
    .bind(&local)
    .bind(&addr_domain)
    .bind(&domain)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Recherche destinataire : {e}"))?;

    Ok(row.map(|r| {
        use sqlx::Row;
        r.try_get::<i32, _>("id").unwrap_or(0)
    }))
}

async fn insert_message(
    pool: &PgPool,
    user_id: i32,
    folder: &str,
    from_email: &str,
    to_email: &str,
    subject: &str,
    body: &str,
    message_id: Option<&str>,
    is_read: bool,
) -> Result<i64, String> {
    let res: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
        r#"
        INSERT INTO mail_messages
            (user_id, folder, from_email, to_email, subject, body_text, message_id, is_read)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        "#,
    )
    .bind(user_id)
    .bind(folder)
    .bind(from_email)
    .bind(to_email)
    .bind(subject)
    .bind(body)
    .bind(message_id)
    .bind(is_read)
    .fetch_optional(pool)
    .await;

    match res {
        Ok(id) => Ok(id.unwrap_or(0)),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("idx_mail_messages_dedup") || msg.contains("duplicate key") {
                Ok(0)
            } else {
                Err(format!("Enregistrement du courrier : {e}"))
            }
        }
    }
}

pub async fn deliver_inbound(
    pool: &PgPool,
    from_email: &str,
    recipients: &[String],
    subject: &str,
    body: &str,
    message_id: Option<&str>,
    domain: &str,
) -> Result<usize, String> {
    let mut stored = 0usize;
    for rcpt in recipients {
        let Some(uid) = find_local_user(pool, rcpt, domain).await? else {
            continue;
        };
        let id = insert_message(
            pool,
            uid,
            "inbox",
            from_email,
            rcpt,
            subject,
            body,
            message_id,
            false,
        )
        .await?;
        if id > 0 {
            stored += 1;
        }
    }
    Ok(stored)
}

pub async fn send_user_mail(
    pool: &PgPool,
    sender_id: i32,
    domain: &str,
    to_raw: &str,
    subject: &str,
    body: &str,
) -> Result<i64, String> {
    let recipients = split_recipients(to_raw);
    if recipients.is_empty() {
        return Err("Indiquez au moins un destinataire.".into());
    }

    let sender = sqlx::query(
        "SELECT email, username FROM users WHERE id = $1 AND is_active = TRUE",
    )
    .bind(sender_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Expéditeur : {e}"))?
    .ok_or_else(|| "Compte expéditeur introuvable.".to_string())?;

    use sqlx::Row;
    let email: Option<String> = sender.try_get("email").ok().flatten();
    let username: String = sender.try_get("username").unwrap_or_default();
    let from = email
        .filter(|s| s.contains('@'))
        .unwrap_or_else(|| format!("{username}@{domain}"));

    let to_joined = recipients.join(", ");
    let message_id = format!(
        "<{}@{}>",
        uuid::Uuid::new_v4(),
        domain.trim().to_ascii_lowercase()
    );

    let sent_id = insert_message(
        pool,
        sender_id,
        "sent",
        &from,
        &to_joined,
        subject,
        body,
        Some(&message_id),
        true,
    )
    .await?;

    let mut external = Vec::new();
    for rcpt in &recipients {
        if let Some(uid) = find_local_user(pool, rcpt, domain).await? {
            let _ = insert_message(
                pool,
                uid,
                "inbox",
                &from,
                rcpt,
                subject,
                body,
                Some(&message_id),
                false,
            )
            .await?;
        } else {
            external.push(rcpt.clone());
        }
    }

    for rcpt in external {
        let _ = enqueue(pool, &rcpt, subject, body).await;
    }

    Ok(sent_id)
}

pub async fn list_mailbox(
    pool: &PgPool,
    user_id: i32,
    folder: &str,
    limit: i64,
) -> Result<Vec<MailMessage>, String> {
    let folder = if folder == "sent" { "sent" } else { "inbox" };
    let rows = sqlx::query(
        r#"
        SELECT id, folder, from_email, to_email, subject, is_read, created_at
        FROM mail_messages
        WHERE user_id = $1 AND folder = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(folder)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Boîte mail : {e}"))?;

    use sqlx::Row;
    Ok(rows
        .into_iter()
        .map(|row| MailMessage {
            id: row.try_get("id").unwrap_or(0),
            folder: row.try_get("folder").unwrap_or_default(),
            from_email: row.try_get("from_email").unwrap_or_default(),
            to_email: row.try_get("to_email").unwrap_or_default(),
            subject: row.try_get("subject").unwrap_or_default(),
            body_text: String::new(),
            is_read: row.try_get("is_read").unwrap_or(false),
            created_at: row
                .try_get::<chrono::DateTime<Utc>, _>("created_at")
                .ok()
                .map(|d| d.to_rfc3339())
                .unwrap_or_default(),
        })
        .collect())
}

pub async fn get_message(
    pool: &PgPool,
    user_id: i32,
    id: i64,
) -> Result<MailMessage, String> {
    let row = sqlx::query(
        r#"
        SELECT id, folder, from_email, to_email, subject, body_text, is_read, created_at
        FROM mail_messages
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Courrier : {e}"))?
    .ok_or_else(|| "Message introuvable.".to_string())?;

    use sqlx::Row;
    Ok(MailMessage {
        id: row.try_get("id").unwrap_or(0),
        folder: row.try_get("folder").unwrap_or_default(),
        from_email: row.try_get("from_email").unwrap_or_default(),
        to_email: row.try_get("to_email").unwrap_or_default(),
        subject: row.try_get("subject").unwrap_or_default(),
        body_text: row.try_get("body_text").unwrap_or_default(),
        is_read: row.try_get("is_read").unwrap_or(false),
        created_at: row
            .try_get::<chrono::DateTime<Utc>, _>("created_at")
            .ok()
            .map(|d| d.to_rfc3339())
            .unwrap_or_default(),
    })
}

pub async fn mark_read(pool: &PgPool, user_id: i32, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE mail_messages SET is_read = TRUE WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Lecture : {e}"))?;
    Ok(())
}

pub async fn unread_count(pool: &PgPool, user_id: i32) -> Result<i64, String> {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM mail_messages WHERE user_id = $1 AND folder = 'inbox' AND is_read = FALSE",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Non lus : {e}"))
}
