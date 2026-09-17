mod commands;
mod config;
mod db;
mod log_buffer;
mod log_archive;
mod log_seal;
mod ad_employee;
mod avatar;
mod pg_notify;
mod ws;
mod background;
mod priority_overlay;

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
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                EnvFilter::new("enterprise_chat_lib=info,enterprise_chat=info")
            }),
        )
        .with(log_buffer::CaptureLayer)
        .init();

    let state: SharedState = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            background::show_main(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state.clone())
        .setup(move |app| {
            crate::log_archive::init_worker();
            if let Ok(dir) = app.path().app_config_dir() {
                crate::log_seal::init(&dir);
            }
            background::setup_tray(app)?;
            background::hide_on_autostart(app);
            background::ensure_default_autostart();
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
            commands::auth::cmd_update_my_avatar,
            commands::auth::cmd_clear_my_avatar,
            commands::auth::cmd_update_my_profile,
            // ── Admin ────────────────────────────────────
            commands::admin::cmd_admin_list_users,
            commands::admin::cmd_admin_update_role,
            commands::admin::cmd_admin_toggle_status,
            commands::admin::cmd_admin_get_stats,
            commands::admin::cmd_admin_get_logs,
            commands::admin::cmd_admin_get_runtime_logs,
            commands::admin::cmd_admin_export_runtime_logs,
            commands::admin::cmd_admin_get_sync_history,
            commands::admin::cmd_admin_sync_ad,
            commands::admin::cmd_admin_create_user,
            commands::admin::cmd_admin_reset_local_password,
            commands::admin::cmd_admin_list_log_archives,
            commands::admin::cmd_admin_read_log_archive,
            commands::admin::cmd_admin_list_join_requests,
            commands::admin::cmd_admin_review_join_request,
            // ── Chat ─────────────────────────────────────
            commands::chat::cmd_get_ws_port,
            commands::chat::cmd_list_users,
            commands::chat::cmd_get_conversations,
            commands::chat::cmd_get_messages,
            commands::chat::cmd_send_message,
            commands::chat::cmd_mark_as_read,
            commands::chat::cmd_search_messages,
            commands::chat::cmd_search_all_messages,
            commands::chat::cmd_upload_attachment,
            commands::chat::cmd_create_direct_conversation,
            commands::chat::cmd_create_group_conversation,
            commands::chat::cmd_add_group_member,
            commands::chat::cmd_remove_group_member,
            commands::chat::cmd_update_member_role,
            commands::chat::cmd_request_org_group_join,
            commands::chat::cmd_update_group,
            commands::chat::cmd_send_message_with_file,
            commands::chat::cmd_get_file_as_base64,
            commands::chat::cmd_get_attachment_data,
            commands::chat::cmd_get_conversation_media,
            commands::chat::cmd_edit_message,
            commands::chat::cmd_delete_message,
            // ── Notifications ─────────────────────────────
            commands::notifications::cmd_send_toast_notification,
            commands::notifications::cmd_send_priority_notification,
            commands::notifications::cmd_set_badge_count,
            commands::notifications::cmd_request_notification_permission,
            commands::notifications::cmd_focus_window,
            commands::notifications::cmd_test_notification,
            commands::notifications::cmd_dismiss_priority_overlay,
            commands::app::cmd_get_autostart,
            commands::app::cmd_set_autostart,
            commands::app::cmd_admin_save_config,
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if background::should_exit() {
                    return;
                }
                api.prevent_close();
                background::hide_to_tray(window);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running FiEcho");
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
    tracing::info!("Initializing FiEcho...");

    let jwt_secret = load_or_create_jwt_secret(&app_handle).await;
    {
        let mut s = state.lock().await;
        s.jwt_secret = jwt_secret.clone();
    }
    if let Ok(dir) = app_handle.path().app_config_dir() {
        crate::log_seal::init(&dir);
    }

    commands::app::bootstrap(app_handle, state).await?;
    Ok(())
}
