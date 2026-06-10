use crate::SharedState;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use tauri::State;

const LDAP_SERVICE_DN: &str = "CN=stagdsi,CN=Users,DC=firsttrust,DC=cm";
const LDAP_SERVICE_PASSWORD: &str = "Internal@2025";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: i32,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub title: Option<String>,
    pub phone: Option<String>,
    pub avatar_path: Option<String>,
    pub role: String,
    pub presence_status: String,
    pub status_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    user_id: i32,
    role: String,
    session_version: i32,
    exp: i64,
    iat: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub user: UserProfile,
    pub token: String,
}

#[tauri::command]
pub async fn cmd_ldap_login(
    username: String,
    password: String,
    state: State<'_, SharedState>,
) -> Result<LoginResult, String> {
    let (pool, config, jwt_secret) = {
        let s = state.lock().await;
        let pool = s.db_pool.clone().ok_or("Base de données non connectée")?;
        let config = s.config.clone().ok_or("Application non configurée")?;
        let jwt_secret = s.jwt_secret.clone();
        (pool, config, jwt_secret)
    };

    if jwt_secret.is_empty() {
        return Err("Serveur non prêt — veuillez réessayer dans un instant.".to_string());
    }

    let ldap_url = if config.ldap_use_tls {
        format!("ldaps://{}:{}", config.ldap_host, config.ldap_port)
    } else {
        format!("ldap://{}:{}", config.ldap_host, config.ldap_port)
    };

    // ── Étape 1 : bind compte de service ─────────────────────────────────────
    let (conn, mut ldap) = LdapConnAsync::new(&ldap_url)
        .await
        .map_err(|e| format!("Impossible de contacter le serveur LDAP : {e}"))?;
    ldap3::drive!(conn);

    ldap.simple_bind(LDAP_SERVICE_DN, LDAP_SERVICE_PASSWORD)
        .await
        .map_err(|e| format!("Erreur bind compte de service : {e}"))?
        .success()
        .map_err(|_| "Compte de service LDAP invalide — contactez l'administrateur.".to_string())?;

    // ── Étape 2 : recherche du DN utilisateur ────────────────────────────────
    let attrs = vec![
        "displayName", "mail", "department", "title", "telephoneNumber",
        config.ldap_user_attribute.as_str(),
    ];
    let filter = format!(
        "(&(objectClass=person)({}={}))",
        config.ldap_user_attribute, username
    );

    let (rs, _res) = ldap
        .search(&config.ldap_base_dn, Scope::Subtree, &filter, attrs)
        .await
        .map_err(|e| format!("Recherche LDAP échouée : {e}"))?
        .success()
        .map_err(|e| format!("Erreur LDAP : {e}"))?;

    let entry = rs
        .into_iter()
        .next()
        .map(SearchEntry::construct)
        .ok_or("Utilisateur introuvable dans l'AD")?;

    let user_dn = entry.dn.clone();

    let get_attr = |key: &str| {
        entry.attrs.get(key).and_then(|v| v.first()).map(|s| s.to_string())
    };

    let display_name = get_attr("displayName").unwrap_or_else(|| username.clone());
    let email        = get_attr("mail");
    let department   = get_attr("department");
    let title        = get_attr("title");
    let phone        = get_attr("telephoneNumber");

    drop(ldap);

    // ── Étape 3 : bind avec les credentials utilisateur ──────────────────────
    let (conn2, mut ldap2) = LdapConnAsync::new(&ldap_url)
        .await
        .map_err(|e| format!("Impossible de contacter le serveur LDAP : {e}"))?;
    ldap3::drive!(conn2);

    ldap2
        .simple_bind(&user_dn, &password)
        .await
        .map_err(|e| format!("Erreur LDAP : {e}"))?
        .success()
        .map_err(|_| "Identifiants incorrects".to_string())?;

    drop(ldap2);

    // ── Étape 4 : upsert utilisateur en base ─────────────────────────────────
    let row = sqlx::query(
        r#"
        INSERT INTO users (username, display_name, email, department, title, phone, ldap_dn, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (username) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            email        = EXCLUDED.email,
            department   = EXCLUDED.department,
            title        = EXCLUDED.title,
            phone        = EXCLUDED.phone,
            ldap_dn      = EXCLUDED.ldap_dn,
            updated_at   = NOW()
        RETURNING id, role, avatar_path, status_message, presence_status, session_version
        "#,
    )
    .bind(&username)
    .bind(&display_name)
    .bind(&email)
    .bind(&department)
    .bind(&title)
    .bind(&phone)
    .bind(&user_dn)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Erreur base de données : {e}"))?;

    use sqlx::Row;
    let user_id: i32         = row.try_get("id").map_err(|e| e.to_string())?;
    let role: String         = row.try_get("role").map_err(|e| e.to_string())?;
    let avatar_path          = row.try_get::<Option<String>, _>("avatar_path").ok().flatten();
    let status_message       = row.try_get::<Option<String>, _>("status_message").ok().flatten();
    let session_version: i32 = row.try_get("session_version").unwrap_or(1);

    // ── Étape 5 : présence online ─────────────────────────────────────────────
    sqlx::query(
        "INSERT INTO user_presence (user_id, status, last_heartbeat)
         VALUES ($1, 'online', NOW())
         ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW()",
    )
    .bind(user_id)
    .execute(&pool)
    .await
    .ok();

    // ── Étape 6 : génération JWT ──────────────────────────────────────────────
    let now = Utc::now();
    let claims = Claims {
        sub: username.clone(),
        user_id,
        role: role.clone(),
        session_version,
        iat: now.timestamp(),
        exp: (now + Duration::hours(8)).timestamp(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| format!("Erreur JWT : {e}"))?;

    // ── Étape 7 : audit log ───────────────────────────────────────────────────
    sqlx::query(
        "INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, 'login', $2)",
    )
    .bind(user_id)
    .bind(serde_json::json!({ "username": username }).to_string())
    .execute(&pool)
    .await
    .ok();

    Ok(LoginResult {
        user: UserProfile {
            id: user_id,
            username,
            display_name,
            email,
            department,
            title,
            phone,
            avatar_path,
            role,
            presence_status: "online".to_string(),
            status_message,
        },
        token,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_logout
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_logout(
    token: Option<String>,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (s.db_pool.clone(), s.jwt_secret.clone())
    };

    let token = match token {
        Some(t) => t,
        None => return Ok(()),
    };

    if let (Some(pool), Ok(data)) = (
        pool,
        decode::<Claims>(
            &token,
            &DecodingKey::from_secret(jwt_secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        ),
    ) {
        let user_id = data.claims.user_id; // i32

        sqlx::query("UPDATE users SET session_version = session_version + 1 WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .ok();

        sqlx::query(
            "UPDATE user_presence SET status = 'offline', last_heartbeat = NOW() WHERE user_id = $1",
        )
        .bind(user_id)
        .execute(&pool)
        .await
        .ok();

        sqlx::query("INSERT INTO audit_logs (actor_id, action) VALUES ($1, 'logout')")
            .bind(user_id)
            .execute(&pool)
            .await
            .ok();
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_get_session
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub user_id: i32,    // INT4
    pub username: String,
    pub role: String,
    pub expires_at: i64, // timestamp UNIX
}

#[tauri::command]
pub async fn cmd_get_session(
    token: String,
    state: State<'_, SharedState>,
) -> Result<SessionInfo, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (s.db_pool.clone(), s.jwt_secret.clone())
    };

    let data = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| "Session expirée ou invalide".to_string())?;

    let claims = data.claims;

    if let Some(pool) = pool {
        let row = sqlx::query("SELECT session_version FROM users WHERE id = $1")
            .bind(claims.user_id) // i32
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Erreur base de données : {e}"))?;

        if let Some(row) = row {
            use sqlx::Row;
            let db_version: i32 = row.try_get("session_version").unwrap_or(1);
            if claims.session_version != db_version {
                return Err("Session invalidée — veuillez vous reconnecter.".to_string());
            }
        }
    }

    Ok(SessionInfo {
        user_id: claims.user_id,
        username: claims.sub,
        role: claims.role,
        expires_at: claims.exp,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// cmd_refresh_session
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_refresh_session(
    token: String,
    state: State<'_, SharedState>,
) -> Result<String, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (s.db_pool.clone(), s.jwt_secret.clone())
    };

    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 3600;

    let data = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| "Token invalide".to_string())?;

    let claims = data.claims;

    if let Some(pool) = pool {
        let row = sqlx::query("SELECT session_version FROM users WHERE id = $1")
            .bind(claims.user_id) // i32
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("Erreur DB : {e}"))?;

        if let Some(row) = row {
            use sqlx::Row;
            let db_version: i32 = row.try_get("session_version").unwrap_or(1);
            if claims.session_version != db_version {
                return Err("Session invalidée — veuillez vous reconnecter.".to_string());
            }
        }
    }

    let now = Utc::now();
    let new_claims = Claims {
        sub: claims.sub,
        user_id: claims.user_id, // i32
        role: claims.role,
        session_version: claims.session_version,
        iat: now.timestamp(),
        exp: (now + Duration::hours(8)).timestamp(),
    };

    encode(
        &Header::default(),
        &new_claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| format!("Erreur JWT : {e}"))
}