use crate::SharedState;
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;

// ─── JWT helper ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Claims {
    user_id: i32,
    role: String,
}

pub(crate) fn require_admin(token: &str, secret: &str) -> Result<i32, String> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| "Session expirée ou invalide".to_string())?;

    if data.claims.role != "system_admin" {
        return Err("Accès réservé aux administrateurs".to_string());
    }

    Ok(data.claims.user_id)
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    pub id: i32,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub presence_status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub auth_source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStats {
    pub total_users: i64,
    pub active_users_today: i64,
    pub total_messages_today: i64,
    pub total_groups: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: i32,
    pub actor_username: Option<String>,
    pub action: String,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHistoryEntry {
    pub id: i32,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub users_added: i32,
    pub users_updated: i32,
    pub users_disabled: i32,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub added: i32,
    pub updated: i32,
    pub disabled: i32,
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_list_users
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_list_users(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<AdminUser>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    require_admin(&token, &jwt_secret)?;

    let rows = sqlx::query(
        r#"
        SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.department,
            u.role,
            u.is_active,
            COALESCE(up.status, 'offline') AS presence_status,
            u.last_seen,
            COALESCE(u.auth_source, 'ad') AS auth_source
        FROM users u
        LEFT JOIN user_presence up ON up.user_id = u.id
        ORDER BY u.display_name ASC
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    let users = rows
        .into_iter()
        .map(|row| AdminUser {
            id:               row.try_get("id").unwrap_or(0),
            username:         row.try_get("username").unwrap_or_default(),
            display_name:     row.try_get("display_name").unwrap_or_default(),
            email:            row.try_get("email").ok().flatten(),
            department:       row.try_get("department").ok().flatten(),
            role:             row.try_get("role").unwrap_or_default(),
            is_active:        row.try_get("is_active").unwrap_or(true),
            presence_status:  row.try_get("presence_status").unwrap_or_else(|_| "offline".into()),
            last_seen:        row.try_get("last_seen").ok().flatten(),
            auth_source:      row.try_get("auth_source").unwrap_or_else(|_| "ad".into()),
        })
        .collect();

    Ok(users)
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_update_role
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_update_role(
    token: String,
    user_id: i32,
    new_role: String,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let actor_id = require_admin(&token, &jwt_secret)?;

    if new_role != "user" && new_role != "system_admin" {
        return Err("Rôle invalide".to_string());
    }

    sqlx::query("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2")
        .bind(&new_role)
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur base de données : {e}"))?;

    sqlx::query(
        "INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'update_role', 'user', $2, $3)",
    )
    .bind(actor_id)
    .bind(user_id)
    .bind(serde_json::json!({ "new_role": new_role }).to_string())
    .execute(&pool)
    .await
    .ok();

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_toggle_status
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_toggle_status(
    token: String,
    user_id: i32,
    is_active: bool,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let actor_id = require_admin(&token, &jwt_secret)?;

    sqlx::query("UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2")
        .bind(is_active)
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur base de données : {e}"))?;

    let action = if is_active { "enable_user" } else { "disable_user" };
    sqlx::query(
        "INSERT INTO audit_logs (actor_id, action, target_type, target_id)
         VALUES ($1, $2, 'user', $3)",
    )
    .bind(actor_id)
    .bind(action)
    .bind(user_id)
    .execute(&pool)
    .await
    .ok();

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_get_stats
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_get_stats(
    token: String,
    state: State<'_, SharedState>,
) -> Result<AdminStats, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    require_admin(&token, &jwt_secret)?;

    let total_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE is_active = true",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let active_users_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT user_id) FROM user_presence
         WHERE last_heartbeat >= NOW() - INTERVAL '24 hours'",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let total_messages_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages
         WHERE created_at >= DATE_TRUNC('day', NOW()) AND is_deleted = false",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let total_groups: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM groups WHERE is_active = true",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    Ok(AdminStats {
        total_users,
        active_users_today,
        total_messages_today,
        total_groups,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_get_logs
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_get_logs(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<AuditLogEntry>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    require_admin(&token, &jwt_secret)?;

    let rows = sqlx::query(
        r#"
        SELECT
            al.id,
            u.username AS actor_username,
            al.action,
            al.details::text AS details,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_id
        ORDER BY al.created_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    let logs = rows
        .into_iter()
        .map(|row| AuditLogEntry {
            id:             row.try_get("id").unwrap_or(0),
            actor_username: row.try_get("actor_username").ok().flatten(),
            action:         row.try_get("action").unwrap_or_default(),
            details:        row.try_get("details").ok().flatten(),
            created_at:     row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
        })
        .collect();

    Ok(logs)
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_get_sync_history
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_get_sync_history(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<SyncHistoryEntry>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    require_admin(&token, &jwt_secret)?;

    let rows = sqlx::query(
        r#"
        SELECT id, started_at, completed_at,
               users_added, users_updated, users_disabled,
               status, error_message
        FROM sync_history
        ORDER BY started_at DESC
        LIMIT 20
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    let entries = rows
        .into_iter()
        .map(|row| SyncHistoryEntry {
            id:             row.try_get("id").unwrap_or(0),
            started_at:     row.try_get("started_at").unwrap_or_else(|_| Utc::now()),
            completed_at:   row.try_get("completed_at").ok().flatten(),
            users_added:    row.try_get("users_added").unwrap_or(0),
            users_updated:  row.try_get("users_updated").unwrap_or(0),
            users_disabled: row.try_get("users_disabled").unwrap_or(0),
            status:         row.try_get("status").unwrap_or_default(),
            error_message:  row.try_get("error_message").ok().flatten(),
        })
        .collect();

    Ok(entries)
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_admin_sync_ad
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_sync_ad(
    token: String,
    dry_run: bool,
    state: State<'_, SharedState>,
) -> Result<SyncResult, String> {
    let (pool, config, jwt_secret) = {
        let s = state.lock().await;
        let pool   = s.db_pool.clone().ok_or("Base de données non connectée")?;
        let config = s.config.clone().ok_or("Application non configurée")?;
        let secret = s.jwt_secret.clone();
        (pool, config, secret)
    };

    let actor_id = require_admin(&token, &jwt_secret)?;

    // ── Enregistrer le début de la sync ──────────────────────────────────────
    let sync_id: i32 = if !dry_run {
        sqlx::query_scalar(
            "INSERT INTO sync_history (triggered_by, status) VALUES ($1, 'running') RETURNING id",
        )
        .bind(actor_id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0)
    } else {
        0
    };

    // ── Connexion LDAP ────────────────────────────────────────────────────────
    let ldap_url = if config.ldap_use_tls {
        format!("ldaps://{}:{}", config.ldap_host, config.ldap_port)
    } else {
        format!("ldap://{}:{}", config.ldap_host, config.ldap_port)
    };

    let result: Result<SyncResult, String> = async {
        let (conn, mut ldap) = LdapConnAsync::new(&ldap_url)
            .await
            .map_err(|e| format!("Impossible de contacter le serveur LDAP : {e}"))?;
        ldap3::drive!(conn);

        ldap.simple_bind(&config.ldap_bind_dn, &config.ldap_bind_password)
            .await
            .map_err(|e| format!("Erreur bind compte de service : {e}"))?
            .success()
            .map_err(|_| "Compte de service LDAP invalide".to_string())?;

        // Rechercher tous les comptes actifs
        let attrs = vec![
            config.ldap_user_attribute.as_str(),
            "displayName",
            "mail",
            "department",
            "title",
            "telephoneNumber",
        ];
        let filter = format!(
            "(&(objectClass=person)({}=*))",
            config.ldap_user_attribute
        );

        let (rs, _) = ldap
            .search(&config.ldap_base_dn, Scope::Subtree, &filter, attrs)
            .await
            .map_err(|e| format!("Recherche LDAP échouée : {e}"))?
            .success()
            .map_err(|e| format!("Erreur LDAP : {e}"))?;

        drop(ldap);

        let entries: Vec<SearchEntry> = rs.into_iter().map(SearchEntry::construct).collect();

        let mut added = 0i32;
        let mut updated = 0i32;
        let mut ad_usernames: Vec<String> = Vec::new();

        for entry in &entries {
            let get_attr = |key: &str| {
                entry
                    .attrs
                    .get(key)
                    .and_then(|v| v.first())
                    .map(|s| s.to_string())
            };

            let username = match get_attr(config.ldap_user_attribute.as_str()) {
                Some(u) => u,
                None => continue,
            };
            if crate::ad_employee::is_machine_account(&username) {
                continue;
            }
            let display_name = get_attr("displayName").unwrap_or_else(|| username.clone());
            let email        = get_attr("mail");
            let department   = get_attr("department");
            let title        = get_attr("title");
            let phone        = get_attr("telephoneNumber");
            let user_dn      = entry.dn.clone();

            ad_usernames.push(username.clone());

            if dry_run {
                // En simulation, on compte juste sans toucher la BD
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)",
                )
                .bind(&username)
                .fetch_one(&pool)
                .await
                .unwrap_or(false);

                if exists { updated += 1; } else { added += 1; }
            } else {
                let rows_affected = sqlx::query(
                    r#"
                    INSERT INTO users (username, display_name, email, department, title, phone, ldap_dn, auth_source, is_active, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'ad', true, NOW())
                    ON CONFLICT (username) DO UPDATE SET
                        ldap_dn      = EXCLUDED.ldap_dn,
                        auth_source  = 'ad',
                        is_active    = true,
                        updated_at   = NOW()
                    WHERE users.auth_source IS DISTINCT FROM 'local'
                    "#,
                )
                .bind(&username)
                .bind(&display_name)
                .bind(&email)
                .bind(&department)
                .bind(&title)
                .bind(&phone)
                .bind(&user_dn)
                .execute(&pool)
                .await
                .map_err(|e| format!("Erreur upsert {username} : {e}"))?;

                let n = rows_affected.rows_affected();
                if n == 0 {
                    // Compte local conservé
                } else if n == 1 {
                    added += 1;
                } else {
                    updated += 1;
                }
            }
        }

        // ── Désactiver les utilisateurs absents de l'AD ───────────────────────
        let disabled = if !dry_run && !ad_usernames.is_empty() {
            // Construire la liste de placeholders : $1, $2, ...
            let placeholders: String = ad_usernames
                .iter()
                .enumerate()
                .map(|(i, _)| format!("${}", i + 1))
                .collect::<Vec<_>>()
                .join(", ");

            let query_str = format!(
                "UPDATE users SET is_active = false, updated_at = NOW()
                 WHERE username NOT IN ({placeholders})
                   AND is_active = true
                   AND COALESCE(auth_source, 'ad') <> 'local'
                   AND ldap_dn IS NOT NULL
                 RETURNING id"
            );

            let mut q = sqlx::query(&query_str);
            for u in &ad_usernames {
                q = q.bind(u);
            }
            let rows = q.fetch_all(&pool).await.unwrap_or_default();
            rows.len() as i32
        } else {
            0
        };

        if !dry_run {
            if let Err(e) = crate::ad_employee::sync_all_ad_users(&pool).await {
                tracing::warn!("{e}");
            }
        }

        Ok(SyncResult { added, updated, disabled })
    }
    .await;

    // ── Mettre à jour sync_history ────────────────────────────────────────────
    if !dry_run && sync_id > 0 {
        match &result {
            Ok(r) => {
                sqlx::query(
                    "UPDATE sync_history SET
                         completed_at   = NOW(),
                         users_added    = $1,
                         users_updated  = $2,
                         users_disabled = $3,
                         status         = 'success'
                     WHERE id = $4",
                )
                .bind(r.added)
                .bind(r.updated)
                .bind(r.disabled)
                .bind(sync_id)
                .execute(&pool)
                .await
                .ok();
            }
            Err(e) => {
                sqlx::query(
                    "UPDATE sync_history SET
                         completed_at  = NOW(),
                         status        = 'error',
                         error_message = $1
                     WHERE id = $2",
                )
                .bind(e.as_str())
                .bind(sync_id)
                .execute(&pool)
                .await
                .ok();
            }
        }
    }

    result
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime logs (same stream as the cargo / `tauri dev` terminal)
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_admin_get_runtime_logs(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<crate::log_buffer::RuntimeLog>, String> {
    let jwt_secret = state.lock().await.jwt_secret.clone();
    require_admin(&token, &jwt_secret)?;
    Ok(crate::log_buffer::snapshot())
}

#[tauri::command]
pub async fn cmd_admin_export_runtime_logs(
    token: String,
    path: String,
    contents: Option<String>,
    state: State<'_, SharedState>,
) -> Result<String, String> {
    let jwt_secret = state.lock().await.jwt_secret.clone();
    require_admin(&token, &jwt_secret)?;
    let body = match contents {
        Some(c) if !c.trim().is_empty() => c,
        _ => crate::log_buffer::format_all(),
    };
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    std::fs::write(&path, body.as_bytes())
        .map_err(|e| format!("Impossible d'écrire le fichier : {e}"))?;
    tracing::info!("journal.export");
    Ok(path)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalUserPayload {
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub password: String,
    pub role: Option<String>,
}

#[tauri::command]
pub async fn cmd_admin_create_user(
    token: String,
    payload: CreateLocalUserPayload,
    state: State<'_, SharedState>,
) -> Result<AdminUser, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let actor_id = require_admin(&token, &jwt_secret)?;

    let username = payload.username.trim().to_lowercase();
    let display_name = payload.display_name.trim().to_string();
    if username.len() < 3 || username.len() > 50 {
        return Err("L’identifiant doit contenir entre 3 et 50 caractères.".into());
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err("L’identifiant ne peut contenir que lettres, chiffres, point, tiret et underscore.".into());
    }
    if display_name.is_empty() || display_name.len() > 255 {
        return Err("Le nom affiché est obligatoire.".into());
    }
    if payload.password.len() < 8 {
        return Err("Le mot de passe doit contenir au moins 8 caractères.".into());
    }
    let role = payload.role.unwrap_or_else(|| "user".into());
    if role != "user" && role != "system_admin" {
        return Err("Rôle invalide".into());
    }

    let hash = bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Impossible de sécuriser le mot de passe : {e}"))?;

    let email = payload
        .email
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let department = payload
        .department
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let row = sqlx::query(
        r#"
        INSERT INTO users (username, display_name, email, department, password_hash, role, auth_source, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'local', true, NOW())
        RETURNING id, username, display_name, email, department, role, is_active, last_seen, auth_source
        "#,
    )
    .bind(&username)
    .bind(&display_name)
    .bind(&email)
    .bind(&department)
    .bind(&hash)
    .bind(&role)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate") || msg.contains("unique") {
            "Cet identifiant existe déjà.".to_string()
        } else {
            format!("Erreur base de données : {e}")
        }
    })?;

    let user_id: i32 = row.try_get("id").unwrap_or(0);

    sqlx::query(
        "INSERT INTO user_presence (user_id, status, last_heartbeat)
         VALUES ($1, 'offline', NOW())
         ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(user_id)
    .execute(&pool)
    .await
    .ok();

    sqlx::query(
        "INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'create_local_user', 'user', $2, $3)",
    )
    .bind(actor_id)
    .bind(user_id)
    .bind(serde_json::json!({ "username": username }).to_string())
    .execute(&pool)
    .await
    .ok();

    Ok(AdminUser {
        id: user_id,
        username: row.try_get("username").unwrap_or(username),
        display_name: row.try_get("display_name").unwrap_or(display_name),
        email: row.try_get("email").ok().flatten(),
        department: row.try_get("department").ok().flatten(),
        role: row.try_get("role").unwrap_or(role),
        is_active: row.try_get("is_active").unwrap_or(true),
        presence_status: "offline".into(),
        last_seen: row.try_get("last_seen").ok().flatten(),
        auth_source: "local".into(),
    })
}

#[tauri::command]
pub async fn cmd_admin_reset_local_password(
    token: String,
    user_id: i32,
    password: String,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let actor_id = require_admin(&token, &jwt_secret)?;
    if password.len() < 8 {
        return Err("Le mot de passe doit contenir au moins 8 caractères.".into());
    }

    let auth_source: Option<String> = sqlx::query_scalar(
        "SELECT auth_source FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    match auth_source.as_deref() {
        Some("local") => {}
        Some(_) => return Err("Ce compte est synchronisé avec l’Active Directory.".into()),
        None => return Err("Utilisateur introuvable.".into()),
    }

    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Impossible de sécuriser le mot de passe : {e}"))?;

    sqlx::query(
        "UPDATE users SET password_hash = $1, session_version = session_version + 1, updated_at = NOW() WHERE id = $2",
    )
    .bind(&hash)
    .bind(user_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    sqlx::query(
        "INSERT INTO audit_logs (actor_id, action, target_type, target_id)
         VALUES ($1, 'reset_local_password', 'user', $2)",
    )
    .bind(actor_id)
    .bind(user_id)
    .execute(&pool)
    .await
    .ok();

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogArchive {
    pub log_date: String,
    pub file_name: String,
    pub byte_size: i32,
    pub server_path: Option<String>,
    pub file_written: bool,
    pub write_error: Option<String>,
    pub sealed: bool,
    pub updated_at: DateTime<Utc>,
}

#[tauri::command]
pub async fn cmd_admin_list_log_archives(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<RuntimeLogArchive>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    require_admin(&token, &jwt_secret)?;

    let rows = sqlx::query(
        r#"
        SELECT log_date, file_name, byte_size, server_path, file_written, write_error, updated_at,
               COALESCE(sealed, FALSE) AS sealed
        FROM runtime_log_archives
        ORDER BY log_date DESC
        LIMIT 30
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let d: chrono::NaiveDate = row.try_get("log_date").unwrap_or_else(|_| chrono::Utc::now().date_naive());
            RuntimeLogArchive {
                log_date: d.to_string(),
                file_name: row.try_get("file_name").unwrap_or_default(),
                byte_size: row.try_get("byte_size").unwrap_or(0),
                server_path: row.try_get("server_path").ok().flatten(),
                file_written: row.try_get("file_written").unwrap_or(false),
                write_error: row.try_get("write_error").ok().flatten(),
                sealed: row.try_get("sealed").unwrap_or(false),
                updated_at: row.try_get("updated_at").unwrap_or_else(|_| Utc::now()),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn cmd_admin_read_log_archive(
    token: String,
    log_date: String,
    state: State<'_, SharedState>,
) -> Result<Vec<crate::log_buffer::RuntimeLog>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    require_admin(&token, &jwt_secret)?;

    let contents: Option<String> = sqlx::query_scalar(
        "SELECT contents FROM runtime_log_archives WHERE log_date = $1::date",
    )
    .bind(&log_date)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    let Some(contents) = contents else {
        return Err("Archive introuvable".into());
    };

    Ok(crate::log_seal::open_archive(&contents)
        .into_iter()
        .enumerate()
        .map(|(i, line)| crate::log_buffer::RuntimeLog {
            id: if line.seq > 0 { line.seq } else { (i as u64) + 1 },
            timestamp: line.timestamp,
            level: line.level,
            target: line.target,
            message: if line.host.is_empty() || line.host == "-" {
                line.message
            } else {
                format!("[{}] {}", line.host, line.message)
            },
            code: line.code,
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequestRow {
    pub id: i32,
    pub user_id: i32,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[tauri::command]
pub async fn cmd_admin_list_join_requests(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<JoinRequestRow>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    require_admin(&token, &jwt_secret)?;
    let (gid, _) = crate::ad_employee::ensure_group(&pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT r.id, r.user_id, u.username, u.display_name, u.email, r.status, r.created_at
        FROM group_join_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.group_id = $1
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
        LIMIT 100
        "#,
    )
    .bind(gid)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Demandes d’adhésion : {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| JoinRequestRow {
            id: row.try_get("id").unwrap_or(0),
            user_id: row.try_get("user_id").unwrap_or(0),
            username: row.try_get("username").unwrap_or_default(),
            display_name: row.try_get("display_name").unwrap_or_default(),
            email: row.try_get("email").ok().flatten(),
            status: row.try_get("status").unwrap_or_default(),
            created_at: row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
        })
        .collect())
}

#[tauri::command]
pub async fn cmd_admin_review_join_request(
    token: String,
    request_id: i32,
    approve: bool,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let admin_id = require_admin(&token, &jwt_secret)?;
    let (gid, _) = crate::ad_employee::ensure_group(&pool).await?;

    let row = sqlx::query(
        "SELECT id, user_id, status FROM group_join_requests WHERE id = $1 AND group_id = $2",
    )
    .bind(request_id)
    .bind(gid)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Demande : {e}"))?
    .ok_or_else(|| "Demande introuvable.".to_string())?;

    let user_id: i32 = row.try_get("user_id").unwrap_or(0);
    let status: String = row.try_get("status").unwrap_or_default();
    if status != "pending" {
        return Err("Cette demande a déjà été traitée.".into());
    }

    if approve {
        crate::ad_employee::add_user(&pool, user_id, "admin").await?;
        sqlx::query(
            "UPDATE group_join_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1",
        )
        .bind(request_id)
        .bind(admin_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Approbation : {e}"))?;
    } else {
        sqlx::query(
            "UPDATE group_join_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2 WHERE id = $1",
        )
        .bind(request_id)
        .bind(admin_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Refus : {e}"))?;
    }
    Ok(())
}
