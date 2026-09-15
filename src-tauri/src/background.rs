use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Manager, Window,
};

static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

pub fn request_exit() {
    ALLOW_EXIT.store(true, Ordering::SeqCst);
}

pub fn should_exit() -> bool {
    ALLOW_EXIT.load(Ordering::SeqCst)
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide_to_tray(window: &Window) {
    let _ = window.hide();
    let _ = window.set_skip_taskbar(true);
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", format!("Ouvrir {}", crate::config::APP_NAME), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
        tray.set_tooltip(Some(format!("{} — actif en arrière-plan", crate::config::APP_NAME)))?;
        tray.on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => {
                request_exit();
                app.exit(0);
            }
            _ => {}
        });
        tray.on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    } else {
        tracing::warn!("Icône de barre d’état introuvable");
    }

    Ok(())
}

pub fn hide_on_autostart(app: &tauri::App) {
    if std::env::args().any(|a| a == "--autostart") {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
            let _ = window.set_skip_taskbar(true);
            tracing::info!("Démarrage en arrière-plan (--autostart)");
        }
    }
}

const RUN_VALUE: &str = "FiEcho";

pub fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        autostart_windows_enabled()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        set_autostart_windows(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err("Démarrage automatique disponible uniquement sur Windows".into())
    }
}

pub fn ensure_default_autostart() {
    if cfg!(debug_assertions) {
        return;
    }
    if !is_autostart_enabled() {
        if let Err(e) = set_autostart_enabled(true) {
            tracing::warn!("Impossible d’activer le démarrage automatique: {e}");
        }
    }
}

fn autostart_command() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(format!("\"{}\" --autostart", exe.display()))
}

#[cfg(target_os = "windows")]
fn autostart_windows_enabled() -> bool {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ, REG_SZ,
    };

    unsafe {
        let subkey = wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
        let name = wide(RUN_VALUE);
        let mut key = std::ptr::null_mut();
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut key) != 0 {
            return false;
        }
        let mut kind: u32 = 0;
        let mut size: u32 = 0;
        let status = RegQueryValueExW(
            key,
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut kind,
            std::ptr::null_mut(),
            &mut size,
        );
        let _ = RegCloseKey(key);
        status == 0 && kind == REG_SZ && size > 0
    }
}

#[cfg(target_os = "windows")]
fn set_autostart_windows(enabled: bool) -> Result<(), String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER, REG_SZ,
    };

    unsafe {
        let subkey = wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
        let name = wide(RUN_VALUE);
        let mut key = std::ptr::null_mut();
        let status = RegCreateKeyW(HKEY_CURRENT_USER, subkey.as_ptr(), &mut key);
        if status != 0 {
            return Err(format!("Registre Windows inaccessible ({status})"));
        }

        let result = if enabled {
            let cmd = autostart_command()?;
            let value = wide(&cmd);
            let bytes = (value.len() * 2) as u32;
            let status = RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr() as *const u8,
                bytes,
            );
            if status == 0 {
                Ok(())
            } else {
                Err(format!("Impossible d’écrire la clé de démarrage ({status})"))
            }
        } else {
            let _ = RegDeleteValueW(key, name.as_ptr());
            Ok(())
        };
        let _ = RegCloseKey(key);
        result
    }
}

#[cfg(target_os = "windows")]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
