use crate::SharedState;
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;

const LDAP_SERVICE_DN: &str = "CN=stagdsi,CN=Users,DC=firsttrust,DC=cm";
const LDAP_SERVICE_PASSWORD: &str = "Internal@2025";

// ─── JWT helper ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Claims {
    user_id: i32,
    role: String,
}

fn require_admin(token: &str, secret: &str) -> Result<i32, String> {
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
            u.last_seen
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

        ldap.simple_bind(LDAP_SERVICE_DN, LDAP_SERVICE_PASSWORD)
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
                    INSERT INTO users (username, display_name, email, department, title, phone, ldap_dn, is_active, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
                    ON CONFLICT (username) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        email        = EXCLUDED.email,
                        department   = EXCLUDED.department,
                        title        = EXCLUDED.title,
                        phone        = EXCLUDED.phone,
                        ldap_dn      = EXCLUDED.ldap_dn,
                        is_active    = true,
                        updated_at   = NOW()
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

                if rows_affected.rows_affected() == 1 {
                    // INSERT (nouvel utilisateur)
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
                 WHERE username NOT IN ({placeholders}) AND is_active = true
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
