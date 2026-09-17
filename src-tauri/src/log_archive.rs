//! Persists the in-memory runtime journal to PostgreSQL (on the DB server)
//! and writes one file per day via `fiecho_write_log_file` (COPY TO).

use crate::log_buffer::RuntimeLog;
use chrono::{Local, NaiveDate};
use sqlx::PgPool;
use std::sync::{Mutex, OnceLock};
use tokio::sync::mpsc;

struct Backend {
    pool: Option<PgPool>,
    log_dir: String,
}

static BACKEND: OnceLock<Mutex<Backend>> = OnceLock::new();
static TX: OnceLock<mpsc::UnboundedSender<RuntimeLog>> = OnceLock::new();

fn backend() -> &'static Mutex<Backend> {
    BACKEND.get_or_init(|| {
        Mutex::new(Backend {
            pool: None,
            log_dir: crate::config::AppConfig::builtin().runtime_log_dir,
        })
    })
}

pub fn init_worker() {
    if TX.get().is_some() {
        return;
    }
    let (tx, mut rx) = mpsc::unbounded_channel::<RuntimeLog>();
    let _ = TX.set(tx);

    tauri::async_runtime::spawn(async move {
        let mut batch: Vec<RuntimeLog> = Vec::new();
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(20));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    while let Ok(e) = rx.try_recv() {
                        batch.push(e);
                    }
                    flush(&mut batch).await;
                }
                msg = rx.recv() => {
                    match msg {
                        Some(e) => {
                            batch.push(e);
                            if batch.len() >= 100 {
                                flush(&mut batch).await;
                            }
                        }
                        None => {
                            flush(&mut batch).await;
                            break;
                        }
                    }
                }
            }
        }
    });
}

pub fn set_backend(pool: PgPool, log_dir: String) {
    if let Ok(mut b) = backend().lock() {
        b.pool = Some(pool);
        if !log_dir.trim().is_empty() {
            b.log_dir = log_dir;
        }
    }
}

pub fn enqueue(entry: &RuntimeLog) {
    if let Some(tx) = TX.get() {
        let _ = tx.send(entry.clone());
    }
}

fn parse_journal_time(stamp: &str) -> chrono::DateTime<chrono::Utc> {
    let normalized = stamp.replace(',', ".");
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%d %H:%M:%S%.f") {
        if let Some(local) = naive.and_local_timezone(Local).single() {
            return local.with_timezone(&chrono::Utc);
        }
    }
    chrono::DateTime::parse_from_rfc3339(stamp)
        .map(|d| d.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now())
}

fn snapshot_backend() -> Option<(PgPool, String)> {
    let b = backend().lock().ok()?;
    Some((b.pool.clone()?, b.log_dir.clone()))
}

async fn flush(batch: &mut Vec<RuntimeLog>) {
    if batch.is_empty() {
        return;
    }
    let Some((pool, log_dir)) = snapshot_backend() else {
        return;
    };

    let rows = std::mem::take(batch);
    let mut dates: std::collections::BTreeSet<NaiveDate> = std::collections::BTreeSet::new();

    for e in &rows {
        let logged_at = parse_journal_time(&e.timestamp);
        let log_date = logged_at.with_timezone(&Local).date_naive();
        dates.insert(log_date);

        let Some(envelope) = crate::log_seal::seal_line(
            e.id,
            &e.timestamp,
            &e.level,
            &e.target,
            &e.message,
            "-",
        ) else {
            continue;
        };

        if sqlx::query(
            r#"
            INSERT INTO runtime_log_lines (log_date, logged_at, level, target, message, host)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(log_date)
        .bind(logged_at)
        .bind("SEAL")
        .bind("jnl")
        .bind(&envelope)
        .bind(Option::<String>::None)
        .execute(&pool)
        .await
        .is_err()
        {
            tracing::debug!("Archivage log ignoré");
        }
    }

    for date in dates {
        archive_day(&pool, &log_dir, date).await;
    }

    let _ = sqlx::query("DELETE FROM runtime_log_lines WHERE log_date < CURRENT_DATE - 14")
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM runtime_log_archives WHERE log_date < CURRENT_DATE - 90")
        .execute(&pool)
        .await;
}

async fn archive_day(pool: &PgPool, log_dir: &str, date: NaiveDate) {
    let file_name = format!("fiecho-runtime-{date}.log");
    let contents: Option<String> = sqlx::query_scalar(
        r#"
        SELECT string_agg(message, E'\n' ORDER BY id)
        FROM runtime_log_lines
        WHERE log_date = $1
        "#,
    )
    .bind(date)
    .fetch_one(pool)
    .await
    .unwrap_or(None);
    let contents = contents.unwrap_or_default();

    let byte_size = contents.len() as i32;
    let dir = log_dir.trim().trim_end_matches(['/', '\\']);
    let server_path = format!("{dir}/{file_name}");

    let write = sqlx::query("SELECT fiecho_write_log_file($1, $2)")
        .bind(&server_path)
        .bind(date)
        .execute(pool)
        .await;

    let (file_written, write_error) = match write {
        Ok(_) => (true, None::<String>),
        Err(e) => (false, Some(e.to_string())),
    };

    let _ = sqlx::query(
        r#"
        INSERT INTO runtime_log_archives
            (log_date, file_name, contents, byte_size, server_path, file_written, write_error, sealed, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
        ON CONFLICT (log_date) DO UPDATE SET
            file_name    = EXCLUDED.file_name,
            contents     = EXCLUDED.contents,
            byte_size    = EXCLUDED.byte_size,
            server_path  = EXCLUDED.server_path,
            file_written = EXCLUDED.file_written,
            write_error  = EXCLUDED.write_error,
            sealed       = TRUE,
            updated_at   = NOW()
        "#,
    )
    .bind(date)
    .bind(&file_name)
    .bind(&contents)
    .bind(byte_size)
    .bind(&server_path)
    .bind(file_written)
    .bind(&write_error)
    .execute(pool)
    .await;

    if file_written {
        tracing::info!("journal.sealed");
    } else if write_error.is_some() {
        tracing::debug!("journal.sealed.write_skipped");
    }
}
