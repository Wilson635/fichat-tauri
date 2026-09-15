mod commands;
mod config;
mod db;
mod ws;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub struct AppState {
    pub db_pool:  Option<sqlx::PgPool>,
    pub config:   Option<config::AppConfig>,
    pub jwt_secret: String,
    pub ws_hub:   Option<Arc<ws::WsHub>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db_pool:    None,
            config:     None,
            jwt_secret: String::new(),
            ws_hub:     None,
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "enterprise_chat=info".into()),
        )
        .init();

    let state: SharedState = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = initialize_app(app_handle, state_clone).await {
                    tracing::error!("App initialization failed: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── App ──────────────────────────────────────
            commands::app::cmd_get_app_status,
            commands::app::cmd_test_db_connection,
            commands::app::cmd_save_config,
            commands::app::cmd_load_config,
            // ── Auth ─────────────────────────────────────
            commands::auth::cmd_ldap_login,
            commands::auth::cmd_logout,
            commands::auth::cmd_get_session,
            commands::auth::cmd_refresh_session,
            // ── Admin ────────────────────────────────────
            commands::admin::cmd_admin_list_users,
            commands::admin::cmd_admin_update_role,
            commands::admin::cmd_admin_toggle_status,
            commands::admin::cmd_admin_get_stats,
            commands::admin::cmd_admin_get_logs,
            commands::admin::cmd_admin_get_sync_history,
            commands::admin::cmd_admin_sync_ad,
            // ── Chat ─────────────────────────────────────
            commands::chat::cmd_get_ws_port,
            commands::chat::cmd_list_users,
            commands::chat::cmd_get_conversations,
            commands::chat::cmd_get_messages,
            commands::chat::cmd_send_message,
            commands::chat::cmd_mark_as_read,
            commands::chat::cmd_search_messages,
            commands::chat::cmd_upload_attachment,
            commands::chat::cmd_create_direct_conversation,
            commands::chat::cmd_create_group_conversation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Enterprise Chat");
}

async fn load_or_create_jwt_secret(app_handle: &tauri::AppHandle) -> String {
    let secret_path = app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("jwt_secret.key");

    if let Ok(existing) = std::fs::read_to_string(&secret_path) {
        let existing = existing.trim().to_string();
        if existing.len() >= 32 {
            tracing::info!("JWT secret loaded from disk ✓");
            return existing;
        }
    }

    let a = uuid::Uuid::new_v4().as_simple().to_string();
    let b = uuid::Uuid::new_v4().as_simple().to_string();
    let secret = format!("{a}{b}");

    if let Some(parent) = secret_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(&secret_path, &secret) {
        Ok(_)  => tracing::info!("JWT secret generated and persisted ✓"),
        Err(e) => tracing::warn!("Could not persist JWT secret: {e}"),
    }
    secret
}

async fn initialize_app(
    app_handle: tauri::AppHandle,
    state: SharedState,
) -> anyhow::Result<()> {
    tracing::info!("Initializing FiChat...");

    let jwt_secret = load_or_create_jwt_secret(&app_handle).await;
    {
        let mut s = state.lock().await;
        s.jwt_secret = jwt_secret.clone();
    }

    let config_path = app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("config.toml");

    if let Ok(cfg) = config::AppConfig::load(&config_path) {
        tracing::info!("Config loaded, connecting to PostgreSQL...");
        match db::create_pool(&cfg.db_url).await {
            Ok(pool) => {
                tracing::info!("PostgreSQL connected ✓");
                if let Err(e) = db::run_migrations(&pool).await {
                    tracing::error!("Migration error: {}", e);
                }

                // ── Start WebSocket server ──────────────────────────────────
                let hub = ws::WsHub::new();
                {
                    let hub_clone  = hub.clone();
                    let pool_clone = pool.clone();
                    let secret     = jwt_secret.clone();
                    tokio::spawn(async move {
                        ws::start_ws_server(hub_clone, pool_clone, secret).await;
                    });
                }

                let mut s = state.lock().await;
                s.db_pool  = Some(pool);
                s.config   = Some(cfg);
                s.ws_hub   = Some(hub);
                tracing::info!("FiChat ready ✓ (WS on port {})", ws::WS_PORT);
            }
            Err(e) => {
                tracing::error!("PostgreSQL connection failed: {}", e);
            }
        }
    } else {
        tracing::info!("No config found — setup required");
    }

    Ok(())
}
