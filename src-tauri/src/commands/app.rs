use crate::{config::AppConfig, db, log_archive, pg_notify, ws, SharedState};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Manager, State};

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub is_configured: bool,
    pub db_connected: bool,
    pub app_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigPayload {
    pub db_url: String,
    pub ldap_host: String,
    pub ldap_port: u16,
    pub ldap_base_dn: String,
    pub ldap_user_attribute: String,
    pub ldap_use_tls: bool,
    pub ldap_bind_dn: Option<String>,
    pub ldap_bind_password: Option<String>,
    pub runtime_log_dir: Option<String>,
}

fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("config.toml"))
}

pub async fn bootstrap(
    app_handle: tauri::AppHandle,
    state: SharedState,
) -> anyhow::Result<()> {
    let path = app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("config.toml");
    let cfg = AppConfig::resolve(&path);
    tracing::info!("Verifying postgres Database Connection ...");
    if let Err(e) = apply_config(&app_handle, &state, cfg, false).await {
        tracing::error!("Connexion initiale impossible : {e}");
    }
    Ok(())
}

pub async fn apply_config(
    app_handle: &tauri::AppHandle,
    state: &SharedState,
    cfg: AppConfig,
    persist: bool,
) -> Result<(), String> {
    if persist {
        let path = config_path(app_handle)?;
        cfg.save(&path).map_err(|e| e.to_string())?;
    }

    {
        let mut s = state.lock().await;
        s.config = Some(cfg.clone());
    }

    let pool = db::create_pool(&cfg.db_url)
        .await
        .map_err(|e| format!("Connexion à la base de données échouée : {e}"))?;

    db::run_migrations(&pool)
        .await
        .map_err(|e| format!("Migration : {e}"))?;

    log_archive::set_backend(pool.clone(), cfg.runtime_log_dir.clone());
    if let Err(e) = crate::ad_employee::ensure_group(&pool).await {
        tracing::warn!("{e}");
    }
    if let Err(e) = crate::ad_employee::sync_all_ad_users(&pool).await {
        tracing::warn!("Peuplement du groupe Employé : {e}");
    }

    let jwt_secret = {
        let s = state.lock().await;
        s.jwt_secret.clone()
    };

    {
        let mut s = state.lock().await;
        let first = s.ws_hub.is_none();
        if first {
            let hub = ws::WsHub::new();
            let hub_clone = hub.clone();
            let pool_clone = pool.clone();
            let secret = jwt_secret.clone();
            tokio::spawn(async move {
                ws::start_ws_server(hub_clone, pool_clone, secret).await;
            });
            pg_notify::start(pool.clone(), hub.clone());
            s.ws_hub = Some(hub);
            tracing::info!("Starting FiEcho ...");
        }
        s.db_pool = Some(pool);
        s.config = Some(cfg);
    }

    Ok(())
}

#[tauri::command]
pub async fn cmd_get_app_status(
    state: State<'_, SharedState>,
) -> Result<AppStatus, String> {
    let s = state.lock().await;
    Ok(AppStatus {
        is_configured: s.config.is_some(),
        db_connected: s.db_pool.is_some(),
        app_name: s
            .config
            .as_ref()
            .map(|c| c.app_name.clone())
            .unwrap_or_else(|| crate::config::APP_NAME.into()),
    })
}

#[tauri::command]
pub async fn cmd_test_db_connection(url: String) -> Result<(), String> {
    db::create_pool(&url)
        .await
        .map(|_| ())
        .map_err(|e| format!("Connexion échouée : {e}"))
}

#[tauri::command]
pub async fn cmd_save_config(
    config: SaveConfigPayload,
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let merged = merge_payload(&state, config).await?;
    apply_config(&app_handle, &state, merged, true).await
}

#[tauri::command]
pub async fn cmd_admin_save_config(
    token: String,
    config: SaveConfigPayload,
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> Result<AppConfig, String> {
    let jwt_secret = state.lock().await.jwt_secret.clone();
    crate::commands::admin::require_admin(&token, &jwt_secret)?;
    let merged = merge_payload(&state, config).await?;
    apply_config(&app_handle, &state, merged.clone(), true).await?;
    Ok(merged)
}

async fn merge_payload(state: &SharedState, config: SaveConfigPayload) -> Result<AppConfig, String> {
    let current = state.lock().await.config.clone().unwrap_or_else(AppConfig::builtin);
    let runtime_log_dir = match config.runtime_log_dir.filter(|s| !s.trim().is_empty()) {
        Some(dir) => AppConfig::normalize_log_dir(&dir)?,
        None => current.runtime_log_dir,
    };
    Ok(AppConfig {
        db_url: config.db_url,
        ldap_host: config.ldap_host,
        ldap_port: config.ldap_port,
        ldap_base_dn: config.ldap_base_dn,
        ldap_user_attribute: config.ldap_user_attribute,
        ldap_use_tls: config.ldap_use_tls,
        ldap_bind_dn: config
            .ldap_bind_dn
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(current.ldap_bind_dn),
        ldap_bind_password: config
            .ldap_bind_password
            .filter(|s| !s.is_empty())
            .unwrap_or(current.ldap_bind_password),
        runtime_log_dir,
        app_name: crate::config::APP_NAME.to_string(),
    })
}

#[tauri::command]
pub async fn cmd_load_config(
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> Result<AppConfig, String> {
    if let Some(cfg) = state.lock().await.config.clone() {
        return Ok(cfg);
    }
    let path = config_path(&app_handle)?;
    Ok(AppConfig::resolve(&path))
}

#[tauri::command]
pub fn cmd_get_autostart() -> bool {
    crate::background::is_autostart_enabled()
}

#[tauri::command]
pub fn cmd_set_autostart(enabled: bool) -> Result<bool, String> {
    crate::background::set_autostart_enabled(enabled)?;
    Ok(crate::background::is_autostart_enabled())
}
