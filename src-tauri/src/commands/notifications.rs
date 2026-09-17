use once_cell::sync::Lazy;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

static PRIORITY_LOCK: Lazy<tokio::sync::Mutex<()>> =
    Lazy::new(|| tokio::sync::Mutex::new(()));

// ─── Toast notification native Windows ────────────────────────────────────────

#[tauri::command]
pub async fn cmd_send_toast_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    _conversation_id: Option<i32>,
    silent: Option<bool>,
) -> Result<(), String> {
    let silent = silent.unwrap_or(false);

    if !silent {
        let plugin_result = app.notification().builder().title(&title).body(&body).show();
        if plugin_result.is_ok() {
            tracing::info!("Toast notification envoyée via plugin Tauri ✓");
            return Ok(());
        }
        tracing::warn!(
            "Plugin notification échoué ({}), fallback PowerShell…",
            plugin_result.unwrap_err()
        );
    }

    #[cfg(target_os = "windows")]
    {
        let safe_title = title.replace('\'', "\\'").replace('"', "\\\"");
        let safe_body = body.replace('\'', "\\'").replace('"', "\\\"");
        let aumid = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

        let audio = if silent {
            r#"<audio silent="true"/>"#
        } else {
            ""
        };

        let ps_script = format!(
            r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]
$template = @"
<toast activationType="foreground">
  <visual>
    <binding template="ToastGeneric">
      <text>{title}</text>
      <text>{body}</text>
    </binding>
  </visual>
  {audio}
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
$toast.Tag = "fichat"
$toast.Group = "fichat"
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{aumid}").Show($toast)
"#,
            title = safe_title,
            body = safe_body,
            audio = audio,
            aumid = aumid
        );

        match std::process::Command::new("powershell")
            .args([
                "-ExecutionPolicy", "Bypass",
                "-WindowStyle", "Hidden",
                "-NonInteractive",
                "-Command", &ps_script,
            ])
            .spawn()
        {
            Ok(_) => tracing::info!("Toast notification envoyée via PowerShell ✓"),
            Err(e) => {
                tracing::error!("PowerShell fallback échoué: {}", e);
                return Err(format!("Notification toast impossible: {e}"));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Notifications toast non disponibles sur cette plateforme".into());
    }

    Ok(())
}

#[tauri::command]
pub async fn cmd_test_notification(
    app: tauri::AppHandle,
    theme: Option<String>,
) -> Result<String, String> {
    cmd_send_priority_notification(
        app,
        format!("{} — Test notification prioritaire", crate::config::APP_NAME),
        "Ceci est une alerte bloquante de test. Fermez cette fenêtre pour continuer.".to_string(),
        None,
        theme,
    )
    .await?;
    Ok("priority_overlay_ok".to_string())
}

// ─── Notification prioritaire : voile Win32 + carte React (style UAC) ─────────

#[tauri::command]
pub async fn cmd_send_priority_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    conversation_id: Option<i32>,
    theme: Option<String>,
) -> Result<(), String> {
    let _guard = PRIORITY_LOCK.lock().await;

    let theme_key = if theme.as_deref() == Some("light") {
        "light"
    } else {
        "dark"
    }
    .to_string();

    crate::background::show_main(&app);
    let _ = app.emit(
        "priority-show-card",
        serde_json::json!({
            "title": title,
            "body": body,
            "conversationId": conversation_id,
            "theme": theme_key,
        }),
    );
    tokio::time::sleep(std::time::Duration::from_millis(140)).await;

    let (tx_created, rx_created) = std::sync::mpsc::channel();
    let app_create = app.clone();
    let theme_create = theme_key.clone();
    app.run_on_main_thread(move || {
        let result = crate::priority_overlay::open_on_this_thread(&app_create, &theme_create);
        let _ = tx_created.send(result);
    })
    .map_err(|e| format!("Thread UI indisponible: {e}"))?;

    rx_created
        .recv()
        .map_err(|e| format!("Création overlay: {e}"))??;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    crate::priority_overlay::set_dismiss_tx(tx);
    let _ = rx.await;
    crate::priority_overlay::close_all(&app);
    let _ = app.emit("priority-overlay-closed", ());
    Ok(())
}

#[tauri::command]
pub async fn cmd_dismiss_priority_overlay(app: tauri::AppHandle) -> Result<(), String> {
    tracing::info!("Fermeture voile prioritaire demandée");
    crate::priority_overlay::close_all(&app);
    Ok(())
}

#[tauri::command]
pub async fn cmd_set_badge_count(app: tauri::AppHandle, count: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let title = if count > 0 {
            format!("{} ({})", crate::config::APP_NAME, count)
        } else {
            crate::config::APP_NAME.to_string()
        };
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_request_notification_permission(
    app: tauri::AppHandle,
) -> Result<String, String> {
    use tauri_plugin_notification::PermissionState;

    let state = app
        .notification()
        .permission_state()
        .map_err(|e| e.to_string())?;

    match state {
        PermissionState::Granted => return Ok("granted".to_string()),
        PermissionState::Denied => return Ok("denied".to_string()),
        _ => {}
    }

    let new_state = app
        .notification()
        .request_permission()
        .map_err(|e| e.to_string())?;

    if new_state == PermissionState::Granted {
        Ok("granted".to_string())
    } else {
        Ok("denied".to_string())
    }
}

#[tauri::command]
pub async fn cmd_focus_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::background::show_main(&app);
    Ok(())
}
