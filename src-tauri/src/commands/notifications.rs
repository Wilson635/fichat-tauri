use std::sync::Arc;
use once_cell::sync::Lazy;
use tauri::window::{Color, Effect, EffectState, EffectsBuilder};
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
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
pub async fn cmd_test_notification(app: tauri::AppHandle) -> Result<String, String> {
    cmd_send_priority_notification(
        app,
        format!("{} — Test notification prioritaire", crate::config::APP_NAME),
        "Ceci est une alerte bloquante de test. Fermez cette fenêtre pour continuer.".to_string(),
        None,
    )
    .await?;
    Ok("priority_overlay_ok".to_string())
}

// ─── Notification prioritaire : overlay natif bloquant (style UAC) ────────────

#[tauri::command]
pub async fn cmd_send_priority_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    conversation_id: Option<i32>,
) -> Result<(), String> {
    let _guard = PRIORITY_LOCK.lock().await;

    let label = format!(
        "priority-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App("priority-alert.html".into()),
    )
    .title(&format!("Message prioritaire — {}", crate::config::APP_NAME))
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .closable(true)
    .skip_taskbar(false)
    .focused(true)
    .visible(true)
    .shadow(false)
    .effects(
        EffectsBuilder::new()
            .effect(Effect::Acrylic)
            .effect(Effect::Blur)
            .state(EffectState::Active)
            .color(Color(11, 18, 32, 72))
            .build(),
    )
    .build()
    .map_err(|e| format!("Impossible d'ouvrir l'alerte prioritaire: {e}"))?;

    cover_virtual_screen(&window);
    let stage = overlay_primary_stage(&window);
    let _ = window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::Acrylic)
            .effect(Effect::Blur)
            .state(EffectState::Active)
            .color(Color(11, 18, 32, 72))
            .build(),
    );
    force_window_foreground(&window);

    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "conversationId": conversation_id,
    });

    let win_eval = window.clone();
    let payload_eval = payload.clone();
    let stage_eval = stage;
    tauri::async_runtime::spawn(async move {
        for delay_ms in [80_u64, 200, 400] {
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            let _ = win_eval.emit("priority-payload", payload_eval.clone());
            let script = format!(
                "window.__FICHAT_PRIORITY__={};window.__FICHAT_STAGE__={};window.dispatchEvent(new Event('fichat-priority'));",
                payload_eval,
                stage_eval
            );
            let _ = win_eval.eval(&script);
        }
    });

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
    let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
    let tx_close = tx.clone();
    let app_open = app.clone();

    let _unlisten = window.listen("priority-respond", move |event| {
        let parsed = serde_json::from_str::<serde_json::Value>(event.payload()).ok();
        let action = parsed
            .as_ref()
            .and_then(|v| v.get("action"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let conv = parsed
            .as_ref()
            .and_then(|v| v.get("conversationId"))
            .and_then(|v| v.as_i64())
            .map(|i| i as i32);

        if action == "open" {
            if let Some(cid) = conv {
                let _ = app_open.emit("priority-open-conversation", cid);
            }
            if let Some(main) = app_open.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }

        if let Ok(mut slot) = tx.lock() {
            if let Some(sender) = slot.take() {
                let _ = sender.send(conv);
            }
        }
    });

    window.on_window_event(move |ev| {
        if matches!(ev, tauri::WindowEvent::Destroyed) {
            if let Ok(mut slot) = tx_close.lock() {
                if let Some(sender) = slot.take() {
                    let _ = sender.send(None);
                }
            }
        }
    });

    let _ = rx.await;

    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }

    Ok(())
}

fn cover_virtual_screen(window: &tauri::WebviewWindow) {
    if let Some((x, y, w, h, _, _, _, _)) = virtual_and_primary_bounds(window) {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = window.set_size(tauri::PhysicalSize::new(w, h));
    } else {
        #[cfg(target_os = "windows")]
        {
            unsafe {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
                    SM_YVIRTUALSCREEN,
                };
                let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
                let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
                let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                if w > 0 && h > 0 {
                    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    let _ = window.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                } else {
                    let _ = window.maximize();
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = window.set_fullscreen(true);
        }
    }
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = window.set_focus();
}

fn overlay_primary_stage(window: &tauri::WebviewWindow) -> serde_json::Value {
    serde_json::to_value(primary_stage_pct(window)).unwrap_or_else(|_| {
        serde_json::json!({ "left": 0.0, "top": 0.0, "width": 100.0, "height": 100.0 })
    })
}

fn primary_stage_pct(window: &tauri::WebviewWindow) -> OverlayStage {
    if let Some((vx, vy, vw, vh, px, py, pw, ph)) = virtual_and_primary_bounds(window) {
        if vw > 0 && vh > 0 {
            return OverlayStage {
                left: (px - vx) as f64 / vw as f64 * 100.0,
                top: (py - vy) as f64 / vh as f64 * 100.0,
                width: pw as f64 / vw as f64 * 100.0,
                height: ph as f64 / vh as f64 * 100.0,
            };
        }
    }
    OverlayStage {
        left: 0.0,
        top: 0.0,
        width: 100.0,
        height: 100.0,
    }
}

#[derive(serde::Serialize)]
struct OverlayStage {
    left: f64,
    top: f64,
    width: f64,
    height: f64,
}

fn virtual_and_primary_bounds(
    window: &tauri::WebviewWindow,
) -> Option<(i32, i32, u32, u32, i32, i32, u32, u32)> {
    let monitors = window.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for monitor in &monitors {
        let p = monitor.position();
        let s = monitor.size();
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x.saturating_add(s.width as i32));
        max_y = max_y.max(p.y.saturating_add(s.height as i32));
    }
    let vw = (max_x - min_x).max(1) as u32;
    let vh = (max_y - min_y).max(1) as u32;

    let primary = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next());
    let primary = primary?;
    let pp = primary.position();
    let ps = primary.size();

    Some((min_x, min_y, vw, vh, pp.x, pp.y, ps.width, ps.height))
}

fn force_window_foreground(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            let raw = unsafe { std::mem::transmute_copy::<_, isize>(&hwnd) };
            unsafe { force_foreground_hwnd(raw) }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn force_foreground_hwnd(hwnd_val: isize) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::{
        AttachThreadInput, GetCurrentThreadId,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
        SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        SW_RESTORE,
    };

    let hwnd = hwnd_val as HWND;
    if hwnd.is_null() {
        return;
    }

    ShowWindow(hwnd, SW_RESTORE);
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
    );

    let fg = GetForegroundWindow();
    let mut fg_pid: u32 = 0;
    let fg_thread = GetWindowThreadProcessId(fg, &mut fg_pid);
    let this_thread = GetCurrentThreadId();
    if fg_thread != 0 && fg_thread != this_thread {
        let _ = AttachThreadInput(this_thread, fg_thread, 1);
        let _ = SetForegroundWindow(hwnd);
        let _ = BringWindowToTop(hwnd);
        let _ = AttachThreadInput(this_thread, fg_thread, 0);
    } else {
        let _ = SetForegroundWindow(hwnd);
        let _ = BringWindowToTop(hwnd);
    }
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
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
