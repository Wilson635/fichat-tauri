use crate::mail;
use crate::SharedState;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
struct Claims {
    user_id: i64,
}

fn extract_uid(token: &str, secret: &str) -> Result<i32, String> {
    let uid = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map(|d| d.claims.user_id)
    .map_err(|_| "Session expirée ou invalide".to_string())?;
    Ok(uid as i32)
}

#[tauri::command]
pub async fn cmd_mail_list(
    token: String,
    folder: Option<String>,
    state: State<'_, SharedState>,
) -> Result<Vec<mail::MailMessage>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    let folder = folder.unwrap_or_else(|| "inbox".into());
    mail::list_mailbox(&pool, uid, &folder, 200).await
}

#[tauri::command]
pub async fn cmd_mail_get(
    token: String,
    id: i64,
    state: State<'_, SharedState>,
) -> Result<mail::MailMessage, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    let mut msg = mail::get_message(&pool, uid, id).await?;
    if !msg.is_read && msg.folder == "inbox" {
        let _ = mail::mark_read(&pool, uid, id).await;
        msg.is_read = true;
    }
    Ok(msg)
}

#[tauri::command]
pub async fn cmd_mail_send(
    token: String,
    to: String,
    subject: String,
    body: String,
    state: State<'_, SharedState>,
) -> Result<i64, String> {
    let (pool, jwt_secret, domain) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
            s.config
                .as_ref()
                .map(|c| c.smtp_inbound_domain.clone())
                .filter(|d| !d.trim().is_empty())
                .unwrap_or_else(|| "firsttrust.cm".into()),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    let subject = subject.trim();
    let subject = if subject.is_empty() {
        "(sans objet)"
    } else {
        subject
    };
    mail::send_user_mail(&pool, uid, &domain, &to, subject, body.trim()).await
}

#[tauri::command]
pub async fn cmd_mail_unread_count(
    token: String,
    state: State<'_, SharedState>,
) -> Result<i64, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    mail::unread_count(&pool, uid).await
}

#[tauri::command]
pub async fn cmd_mail_inbound_status(
    token: String,
    state: State<'_, SharedState>,
) -> Result<crate::mail_inbound::InboundStatus, String> {
    let jwt_secret = state.lock().await.jwt_secret.clone();
    extract_uid(&token, &jwt_secret)?;
    Ok(crate::mail_inbound::snapshot())
}
