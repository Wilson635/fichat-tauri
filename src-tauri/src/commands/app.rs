use crate::{config::AppConfig, db, SharedState};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub is_configured: bool,
    pub db_connected: bool,
    pub app_name: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveConfigPayload {
    pub db_url: String,
    pub ldap_host: String,
    pub ldap_port: u16,
    pub ldap_base_dn: String,
    pub ldap_user_attribute: String,
    pub ldap_use_tls: bool,
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
            .unwrap_or_else(|| "Enterprise Chat".into()),
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
    let cfg = AppConfig {
        db_url: config.db_url.clone(),
        ldap_host: config.ldap_host,
        ldap_port: config.ldap_port,
        ldap_base_dn: config.ldap_base_dn,
        ldap_user_attribute: config.ldap_user_attribute,
        ldap_use_tls: config.ldap_use_tls,
        app_name: "Enterprise Chat".to_string(),
    };

    let config_path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("config.toml");

    cfg.save(&config_path).map_err(|e| e.to_string())?;

    let pool = db::create_pool(&config.db_url)
        .await
        .map_err(|e| e.to_string())?;

    db::run_migrations(&pool).await.map_err(|e| e.to_string())?;

    let mut s = state.lock().await;
    s.db_pool = Some(pool);
    s.config = Some(cfg);

    Ok(())
}

#[tauri::command]
pub async fn cmd_load_config(
    app_handle: tauri::AppHandle,
) -> Result<AppConfig, String> {
    let config_path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("config.toml");

    AppConfig::load(&config_path).map_err(|e| format!("Config non trouvée : {e}"))
}
