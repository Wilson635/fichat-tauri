//! Récepteur SMTP local (passerelle). Désactivé par défaut.
//! N’accepte que des destinataires utilisateurs FiEcho du domaine configuré.

use crate::mail;
use base64::Engine;
use sqlx::PgPool;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::time::timeout;

const MAX_MESSAGE: usize = 8 * 1024 * 1024;

static GEN: AtomicU64 = AtomicU64::new(0);
static STATUS: OnceLock<Mutex<InboundStatus>> = OnceLock::new();

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundStatus {
    pub enabled: bool,
    pub bind: String,
    pub domain: String,
    pub listening: bool,
    pub last_error: Option<String>,
}

fn status() -> &'static Mutex<InboundStatus> {
    STATUS.get_or_init(|| {
        Mutex::new(InboundStatus {
            enabled: false,
            bind: "127.0.0.1:2525".into(),
            domain: "firsttrust.cm".into(),
            listening: false,
            last_error: None,
        })
    })
}

pub fn snapshot() -> InboundStatus {
    status()
        .lock()
        .map(|s| s.clone())
        .unwrap_or(InboundStatus {
            enabled: false,
            bind: String::new(),
            domain: String::new(),
            listening: false,
            last_error: Some("indisponible".into()),
        })
}

fn set_status(patch: impl FnOnce(&mut InboundStatus)) {
    if let Ok(mut s) = status().lock() {
        patch(&mut s);
    }
}

pub fn configure(pool: PgPool, enabled: bool, bind: String, domain: String) {
    let bind = if bind.trim().is_empty() {
        "127.0.0.1:2525".into()
    } else {
        bind.trim().to_string()
    };
    let domain = if domain.trim().is_empty() {
        "firsttrust.cm".into()
    } else {
        domain.trim().to_ascii_lowercase()
    };
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    set_status(|s| {
        s.enabled = enabled;
        s.bind = bind.clone();
        s.domain = domain.clone();
        s.listening = false;
        s.last_error = None;
    });
    if !enabled {
        tracing::info!("Réception SMTP FiEcho désactivée sur ce poste");
        return;
    }
    tauri::async_runtime::spawn(async move {
        run_listener(gen, pool, bind, domain).await;
    });
}

async fn run_listener(gen: u64, pool: PgPool, bind: String, domain: String) {
    let listener = match TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(e) => {
            let msg = format!("Impossible d’écouter le connecteur SMTP : {e}");
            tracing::error!("{msg}");
            set_status(|s| {
                s.listening = false;
                s.last_error = Some(msg);
            });
            return;
        }
    };
    set_status(|s| {
        s.listening = true;
        s.last_error = None;
    });
    tracing::info!("SMTP listener ready");

    loop {
        if GEN.load(Ordering::SeqCst) != gen {
            break;
        }
        let accept = timeout(Duration::from_millis(800), listener.accept()).await;
        match accept {
            Ok(Ok((stream, _peer))) => {
                let pool = pool.clone();
                let domain = domain.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = handle_client(stream, pool, domain).await {
                        tracing::warn!("SMTP session: {e}");
                    }
                });
            }
            Ok(Err(e)) => {
                tracing::warn!("Accept SMTP : {e}");
            }
            Err(_) => {}
        }
    }
    set_status(|s| {
        if GEN.load(Ordering::SeqCst) != gen {
            s.listening = false;
        }
    });
}

async fn handle_client(
    stream: tokio::net::TcpStream,
    pool: PgPool,
    domain: String,
) -> Result<(), String> {
    let _ = stream.set_nodelay(true);
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    write_line(&mut writer, "220 fiecho ESMTP ready").await?;

    let mut mail_from = String::new();
    let mut rcpts: Vec<String> = Vec::new();

    loop {
        let mut line = String::new();
        match timeout(Duration::from_secs(90), reader.read_line(&mut line)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(e.to_string()),
            Err(_) => {
                let _ = write_line(&mut writer, "421 timeout").await;
                break;
            }
        }
        let raw = line.trim_end_matches(['\r', '\n']);
        if raw.is_empty() {
            continue;
        }
        let (cmd, rest) = split_cmd(raw);
        match cmd.as_str() {
            "HELO" | "EHLO" | "LHLO" => {
                write_line(&mut writer, "250-FiEcho").await?;
                write_line(&mut writer, &format!("250-SIZE {MAX_MESSAGE}")).await?;
                write_line(&mut writer, "250 8BITMIME").await?;
            }
            "MAIL" => {
                mail_from = extract_angle(rest).unwrap_or_default();
                rcpts.clear();
                write_line(&mut writer, "250 2.1.0 OK").await?;
            }
            "RCPT" => {
                let addr = extract_angle(rest).unwrap_or_default();
                if addr.is_empty() {
                    write_line(&mut writer, "501 5.1.3 adresse invalide").await?;
                    continue;
                }
                let expected = format!("@{}", domain.to_ascii_lowercase());
                if !addr.to_ascii_lowercase().ends_with(&expected) {
                    write_line(
                        &mut writer,
                        "550 5.1.1 relais refusé — domaine non local",
                    )
                    .await?;
                    continue;
                }
                match mail::find_local_user(&pool, &addr, &domain).await {
                    Ok(Some(_)) => {
                        rcpts.push(mail::normalize_email(&addr));
                        write_line(&mut writer, "250 2.1.5 OK").await?;
                    }
                    Ok(None) => {
                        write_line(
                            &mut writer,
                            "550 5.1.1 destinataire inconnu — relais refusé",
                        )
                        .await?;
                    }
                    Err(e) => {
                        tracing::warn!("RCPT {addr}: {e}");
                        write_line(&mut writer, "451 4.3.0 temporairement indisponible").await?;
                    }
                }
            }
            "DATA" => {
                if rcpts.is_empty() {
                    write_line(&mut writer, "503 5.5.1 RCPT d’abord").await?;
                    continue;
                }
                write_line(&mut writer, "354 end with <CR><LF>.<CR><LF>").await?;
                let data = read_data(&mut reader).await?;
                let parsed = parse_rfc822(&data, &mail_from, &rcpts);
                match mail::deliver_inbound(
                    &pool,
                    &parsed.from,
                    &rcpts,
                    &parsed.subject,
                    &parsed.body,
                    parsed.message_id.as_deref(),
                    &domain,
                )
                .await
                {
                    Ok(n) if n > 0 => {
                        write_line(&mut writer, "250 2.0.0 accepted").await?;
                    }
                    Ok(_) => {
                        write_line(&mut writer, "550 5.1.1 aucun destinataire local").await?;
                    }
                    Err(e) => {
                        tracing::warn!("Livraison SMTP : {e}");
                        write_line(&mut writer, "451 4.3.0 stockage impossible").await?;
                    }
                }
                mail_from.clear();
                rcpts.clear();
            }
            "RSET" => {
                mail_from.clear();
                rcpts.clear();
                write_line(&mut writer, "250 2.0.0 OK").await?;
            }
            "NOOP" => write_line(&mut writer, "250 2.0.0 OK").await?,
            "QUIT" => {
                write_line(&mut writer, "221 2.0.0 bye").await?;
                break;
            }
            "STARTTLS" | "AUTH" | "VRFY" | "EXPN" => {
                write_line(&mut writer, "502 5.5.1 commande non implémentée").await?;
            }
            _ => write_line(&mut writer, "502 5.5.1 commande inconnue").await?,
        }
    }
    Ok(())
}

async fn write_line(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    line: &str,
) -> Result<(), String> {
    writer
        .write_all(format!("{line}\r\n").as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    writer.flush().await.map_err(|e| e.to_string())
}

async fn read_data<R: AsyncBufReadExt + Unpin>(reader: &mut R) -> Result<String, String> {
    let mut buf = String::new();
    loop {
        let mut line = String::new();
        match timeout(Duration::from_secs(90), reader.read_line(&mut line)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(e.to_string()),
            Err(_) => return Err("timeout DATA".into()),
        }
        if buf.len() + line.len() > MAX_MESSAGE {
            return Err("message trop volumineux".into());
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "." {
            break;
        }
        if let Some(rest) = trimmed.strip_prefix('.') {
            buf.push_str(rest);
        } else {
            buf.push_str(trimmed);
        }
        buf.push('\n');
    }
    Ok(buf)
}

fn split_cmd(line: &str) -> (String, &str) {
    let line = line.trim();
    if let Some((cmd, rest)) = line.split_once(' ') {
        (cmd.to_ascii_uppercase(), rest.trim())
    } else {
        (line.to_ascii_uppercase(), "")
    }
}

fn extract_angle(rest: &str) -> Option<String> {
    let rest = rest.trim();
    let after = rest
        .strip_prefix("FROM:")
        .or_else(|| rest.strip_prefix("from:"))
        .or_else(|| rest.strip_prefix("TO:"))
        .or_else(|| rest.strip_prefix("to:"))
        .unwrap_or(rest)
        .trim();
    if after == "<>" {
        return Some(String::new());
    }
    let addr = mail::normalize_email(after);
    if addr.contains('@') {
        Some(addr)
    } else {
        None
    }
}

struct ParsedMail {
    from: String,
    subject: String,
    body: String,
    message_id: Option<String>,
}

fn parse_rfc822(raw: &str, envelope_from: &str, envelope_to: &[String]) -> ParsedMail {
    let (headers, body) = split_headers(raw);
    let from = header_value(&headers, "from")
        .map(|v| mail::normalize_email(&v))
        .filter(|s| s.contains('@'))
        .unwrap_or_else(|| envelope_from.to_string());
    let subject = header_value(&headers, "subject").unwrap_or_else(|| "(sans objet)".into());
    let message_id = header_value(&headers, "message-id");
    let body = extract_text_body(&headers, body);
    let _ = envelope_to;
    ParsedMail {
        from,
        subject,
        body,
        message_id,
    }
}

fn split_headers(raw: &str) -> (String, &str) {
    if let Some(i) = raw.find("\n\n") {
        (raw[..i].to_string(), &raw[i + 2..])
    } else {
        (raw.to_string(), "")
    }
}

fn header_value(headers: &str, name: &str) -> Option<String> {
    let mut current: Option<(String, String)> = None;
    let mut found = None;
    for line in headers.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some((_, ref mut v)) = current {
                v.push(' ');
                v.push_str(line.trim());
            }
            continue;
        }
        if let Some((n, v)) = current.take() {
            if n.eq_ignore_ascii_case(name) {
                found = Some(v);
            }
        }
        if let Some((n, v)) = line.split_once(':') {
            current = Some((n.trim().to_string(), v.trim().to_string()));
        }
    }
    if let Some((n, v)) = current {
        if n.eq_ignore_ascii_case(name) {
            found = Some(v);
        }
    }
    found.filter(|s| !s.is_empty())
}

fn extract_text_body(headers: &str, body: &str) -> String {
    let ct = header_value(headers, "content-type")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let cte = header_value(headers, "content-transfer-encoding")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if let Some(b) = content_boundary(&ct) {
        if let Some(part) = multipart_plain(body, &b) {
            return part;
        }
    }
    let decoded = decode_body(body, &cte);
    strip_simple_html(&decoded)
}

fn content_boundary(ct: &str) -> Option<String> {
    let lower = ct.to_ascii_lowercase();
    let idx = lower.find("boundary=")?;
    let rest = ct[idx + "boundary=".len()..].trim();
    let rest = rest.trim_start_matches('"');
    let end = rest
        .find(|c: char| c == ';' || c == '"' || c.is_whitespace())
        .unwrap_or(rest.len());
    let b = rest[..end].trim_matches('"').to_string();
    if b.is_empty() {
        None
    } else {
        Some(b)
    }
}

fn multipart_plain(body: &str, boundary: &str) -> Option<String> {
    let marker = format!("--{boundary}");
    let mut best: Option<String> = None;
    for part in body.split(&marker) {
        let part = part.trim();
        if part.is_empty() || part == "--" || part.starts_with("--") {
            continue;
        }
        let (ph, pb) = split_headers(part);
        let ct = header_value(&ph, "content-type")
            .unwrap_or_default()
            .to_ascii_lowercase();
        let cte = header_value(&ph, "content-transfer-encoding")
            .unwrap_or_default()
            .to_ascii_lowercase();
        let decoded = decode_body(pb, &cte);
        if ct.contains("text/plain") {
            return Some(decoded);
        }
        if ct.contains("text/html") {
            best = Some(strip_simple_html(&decoded));
        }
    }
    best
}

fn decode_body(body: &str, cte: &str) -> String {
    let cte = cte.trim();
    if cte.contains("base64") {
        let cleaned: String = body.chars().filter(|c| !c.is_whitespace()).collect();
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(cleaned.as_bytes()) {
            return String::from_utf8_lossy(&bytes).into_owned();
        }
    }
    if cte.contains("quoted-printable") {
        return decode_quoted_printable(body);
    }
    body.to_string()
}

fn decode_quoted_printable(input: &str) -> String {
    let mut out = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'=' && i + 2 < bytes.len() {
            if bytes[i + 1] == b'\r' && bytes[i + 2] == b'\n' {
                i += 3;
                continue;
            }
            if bytes[i + 1] == b'\n' {
                i += 2;
                continue;
            }
            let hex = &bytes[i + 1..i + 3];
            if let Ok(s) = std::str::from_utf8(hex) {
                if let Ok(v) = u8::from_str_radix(s, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn strip_simple_html(s: &str) -> String {
    let lower = s.to_ascii_lowercase();
    if !(lower.contains("<html") || lower.contains("<div") || lower.contains("<br")) {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push('\n');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}
