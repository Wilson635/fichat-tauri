use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

// ─── Toast notification native Windows ────────────────────────────────────────
// Tente d'abord via tauri-plugin-notification, puis fallback PowerShell pour
// les builds de développement où l'app n'est pas encore enregistrée Windows.

#[tauri::command]
pub async fn cmd_send_toast_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    _conversation_id: Option<i32>,
) -> Result<(), String> {
    // Tentative 1 : plugin Tauri natif
    let plugin_result = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();

    if plugin_result.is_ok() {
        tracing::info!("Toast notification envoyée via plugin Tauri ✓");
        return Ok(());
    }

    let plugin_err = plugin_result.unwrap_err();
    tracing::warn!(
        "Plugin notification échoué ({}), fallback PowerShell…",
        plugin_err
    );

    // Tentative 2 : PowerShell — fiable même en mode dev sans enregistrement Windows
    #[cfg(target_os = "windows")]
    {
        let safe_title = title.replace('\'', "\\'").replace('"', "\\\"");
        let safe_body = body.replace('\'', "\\'").replace('"', "\\\"");

        // AppUserModelID PowerShell — toujours enregistré sur Windows 10/11
        let aumid = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

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
            Ok(_) => {
                tracing::info!("Toast notification envoyée via PowerShell ✓");
            }
            Err(e) => {
                tracing::error!("PowerShell fallback échoué: {}", e);
                return Err(format!("Notification impossible: plugin={}, powershell={}", plugin_err, e));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err(plugin_err.to_string());
    }

    Ok(())
}

// ─── Notification de test immédiate ───────────────────────────────────────────

#[tauri::command]
pub async fn cmd_test_notification(app: tauri::AppHandle) -> Result<String, String> {
    let title = "FiChat — Test notification".to_string();
    let body = "Les notifications Windows fonctionnent correctement ✓".to_string();

    // Plugin Tauri
    let r = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();

    if r.is_ok() {
        return Ok("plugin_ok".to_string());
    }

    let plugin_err = r.unwrap_err().to_string();

    // Fallback PowerShell
    #[cfg(target_os = "windows")]
    {
        let aumid = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
        let ps = format!(
            r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>FiChat — Test</text><text>Les notifications fonctionnent ✓</text></binding></visual></toast>')
$toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{aumid}").Show($toast)
"#,
            aumid = aumid
        );

        match std::process::Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-Command", &ps])
            .spawn()
        {
            Ok(_) => return Ok("powershell_ok".to_string()),
            Err(e) => return Err(format!("plugin={plugin_err} powershell={e}")),
        }
    }

    #[cfg(not(target_os = "windows"))]
    Err(plugin_err)
}

// ─── Notification prioritaire (dialog modale bloquante) ───────────────────────

#[tauri::command]
pub async fn cmd_send_priority_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();

    app.dialog()
        .message(body)
        .title(title)
        .show(move |_result| {
            let _ = tx.send(());
        });

    let _ = rx.await;
    Ok(())
}

// ─── Badge sur l'icône de la barre des tâches ─────────────────────────────────

#[tauri::command]
pub async fn cmd_set_badge_count(
    app: tauri::AppHandle,
    count: u32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let title = if count > 0 {
            format!("FiChat ({})", count)
        } else {
            "FiChat".to_string()
        };
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Demande de permission OS ─────────────────────────────────────────────────

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

// ─── Amener la fenêtre au premier plan ────────────────────────────────────────

#[tauri::command]
pub async fn cmd_focus_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
