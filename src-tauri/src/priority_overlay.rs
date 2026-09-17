//! Overlay prioritaire UAC : voile Win32 plein bureau + carte React dans FiEcho.
//!
//! Une seconde WebView2 (même opaque) ne peint souvent pas dans le trou du voile.
//! La carte est donc rendue dans la fenêtre principale, déjà visible. Le voile
//! couvre tout le bureau sauf un trou aligné sur cette carte.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const CARD_W: f64 = 520.0;
const CARD_H: f64 = 460.0;
const INPUT_ARM_DELAY: Duration = Duration::from_millis(800);
const ESCAPE_HOTKEY_ID: i32 = 1;
const WM_PRIORITY_DESTROY: u32 = 0x8000 + 32; // WM_APP + 32

struct OverlaySession {
    app: tauri::AppHandle,
}

static DIMMER_HWNDS: OnceLock<Mutex<Vec<isize>>> = OnceLock::new();
static SESSION: OnceLock<Mutex<Option<OverlaySession>>> = OnceLock::new();
static INPUT_ARMED_AT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static DISMISS_TX: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();
static INTENTIONAL_CLOSE: AtomicBool = AtomicBool::new(true);
static DIMMER_THREAD_ID: AtomicU32 = AtomicU32::new(0);

fn dimmer_hwnds() -> &'static Mutex<Vec<isize>> {
    DIMMER_HWNDS.get_or_init(|| Mutex::new(Vec::new()))
}

fn session() -> &'static Mutex<Option<OverlaySession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

fn input_armed_at() -> &'static Mutex<Option<Instant>> {
    INPUT_ARMED_AT.get_or_init(|| Mutex::new(None))
}

fn dismiss_tx() -> &'static Mutex<Option<tokio::sync::oneshot::Sender<()>>> {
    DISMISS_TX.get_or_init(|| Mutex::new(None))
}

fn mark_overlay_shown() {
    INTENTIONAL_CLOSE.store(false, Ordering::SeqCst);
    if let Ok(mut slot) = input_armed_at().lock() {
        *slot = Some(Instant::now() + INPUT_ARM_DELAY);
    }
}

pub fn input_is_armed() -> bool {
    match input_armed_at().lock() {
        Ok(slot) => slot.map(|at| Instant::now() >= at).unwrap_or(false),
        Err(_) => true,
    }
}

fn clear_input_arm() {
    if let Ok(mut slot) = input_armed_at().lock() {
        *slot = None;
    }
}

pub fn allow_card_close() -> bool {
    INTENTIONAL_CLOSE.load(Ordering::SeqCst)
}

fn begin_intentional_close() {
    INTENTIONAL_CLOSE.store(true, Ordering::SeqCst);
    clear_input_arm();
}

pub fn set_dismiss_tx(tx: tokio::sync::oneshot::Sender<()>) {
    if let Ok(mut slot) = dismiss_tx().lock() {
        *slot = Some(tx);
        tracing::info!("Voile prioritaire : attente de fermeture");
    }
}

fn complete_dismiss_tx() {
    if let Ok(mut slot) = dismiss_tx().lock() {
        if let Some(tx) = slot.take() {
            let _ = tx.send(());
        }
    }
}

pub fn open_on_this_thread(app: &tauri::AppHandle, theme: &str) -> Result<(), String> {
    destroy_dimmers();
    let dark = theme != "light";
    let hole = card_hole_from_main(app);
    create_desktop_dimmer(dark, hole);
    if let Ok(mut slot) = session().lock() {
        *slot = Some(OverlaySession { app: app.clone() });
    }
    mark_overlay_shown();
    tracing::info!(
        "Overlay UAC : voile + trou carte {}x{} @ {},{}",
        hole.2,
        hole.3,
        hole.0,
        hole.1
    );
    Ok(())
}

pub fn close_all(app: &tauri::AppHandle) {
    begin_intentional_close();
    if let Ok(mut slot) = session().lock() {
        *slot = None;
    }
    for (label, win) in app.webview_windows() {
        if label.starts_with("priority-") {
            let _ = win.close();
        }
    }
    complete_dismiss_tx();
    destroy_dimmers_from_any_thread(app);
}

pub fn request_dismiss() {
    if !input_is_armed() {
        return;
    }
    let app = session()
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
        .map(|s| s.app);
    if let Some(app) = app {
        close_all(&app);
        let _ = app.emit("priority-overlay-closed", ());
    } else {
        begin_intentional_close();
        destroy_dimmers();
        complete_dismiss_tx();
    }
}

fn destroy_dimmers_from_any_thread(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let creator = DIMMER_THREAD_ID.load(Ordering::SeqCst);
        let current = unsafe { windows_sys::Win32::System::Threading::GetCurrentThreadId() };
        if creator == 0 || creator == current {
            destroy_dimmers();
            return;
        }
        if app.run_on_main_thread(|| destroy_dimmers()).is_err() {
            destroy_dimmers();
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        destroy_dimmers();
    }
}

pub fn destroy_dimmers() {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::UnregisterHotKey;
        use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyWindow, PostMessageW};
        if let Ok(mut guard) = dimmer_hwnds().lock() {
            let count = guard.len();
            for hwnd in guard.drain(..) {
                if hwnd != 0 {
                    let posted = PostMessageW(hwnd as HWND, WM_PRIORITY_DESTROY, 0, 0);
                    if posted == 0 {
                        let _ = UnregisterHotKey(hwnd as HWND, ESCAPE_HOTKEY_ID);
                        let _ = DestroyWindow(hwnd as HWND);
                    }
                }
            }
            if count > 0 {
                tracing::info!("Voile prioritaire : {count} panneau(x) fermé(s)");
            }
        }
    }
}

fn card_hole_from_main(app: &tauri::AppHandle) -> (i32, i32, i32, i32) {
    if let Some(main) = app.get_webview_window("main") {
        let scale = main.scale_factor().ok().unwrap_or(1.0).max(0.1);
        if let (Ok(pos), Ok(size)) = (main.inner_position(), main.inner_size()) {
            let mut cw = (CARD_W * scale).round() as i32;
            let mut ch = (CARD_H * scale).round() as i32;
            cw = cw.min(size.width as i32).max(1);
            ch = ch.min(size.height as i32).max(1);
            let x = pos.x + (size.width as i32 - cw).max(0) / 2;
            let y = pos.y + (size.height as i32 - ch).max(0) / 2;
            return (x, y, cw, ch);
        }
    }
    card_physical_rect(app)
}

fn card_physical_rect(app: &tauri::AppHandle) -> (i32, i32, i32, i32) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten()))
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let scale = m.scale_factor().max(0.1);
        let p = m.position();
        let s = m.size();
        let cw = (CARD_W * scale).round() as i32;
        let ch = (CARD_H * scale).round() as i32;
        let x = p.x + (s.width as i32 - cw).max(0) / 2;
        let y = p.y + (s.height as i32 - ch).max(0) / 2;
        return (x, y, cw, ch);
    }
    (200, 160, CARD_W as i32, CARD_H as i32)
}

fn create_desktop_dimmer(dark: bool, card_rect: (i32, i32, i32, i32)) {
    #[cfg(target_os = "windows")]
    unsafe {
        create_dimmer_windows(dark, card_rect);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (dark, card_rect);
    }
}

#[cfg(target_os = "windows")]
unsafe fn create_dimmer_windows(dark: bool, card_rect: (i32, i32, i32, i32)) {
    use windows_sys::Win32::Graphics::Gdi::CreateSolidBrush;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, MOD_NOREPEAT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, GetSystemMetrics, LoadCursorW, RegisterClassExW, SetLayeredWindowAttributes,
        SetWindowPos, ShowWindow, CS_HREDRAW, CS_VREDRAW, HWND_TOPMOST, IDC_ARROW, LWA_ALPHA,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        SWP_SHOWWINDOW, SW_SHOW, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_EX_TOPMOST, WS_POPUP, WS_VISIBLE,
    };

    destroy_dimmers();

    let class_name: Vec<u16> = "FiEchoPriorityGlass2\0".encode_utf16().collect();
    let instance = GetModuleHandleW(std::ptr::null());
    let color = if dark {
        0x002A_1E0Fu32
    } else {
        0x00F5_F0E8u32
    };
    let brush = CreateSolidBrush(color);
    let class = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(dimmer_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: instance,
        hIcon: std::ptr::null_mut(),
        hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
        hbrBackground: brush,
        lpszMenuName: std::ptr::null(),
        lpszClassName: class_name.as_ptr(),
        hIconSm: std::ptr::null_mut(),
    };
    let _ = RegisterClassExW(&class);

    let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
    let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
    let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    if vw <= 0 || vh <= 0 {
        tracing::error!("Dimmer: métriques d'écran invalides");
        return;
    }

    let (cx, cy, cw, ch) = card_rect;
    let hole_l = cx.max(vx);
    let hole_t = cy.max(vy);
    let hole_r = (cx + cw).min(vx + vw);
    let hole_b = (cy + ch).min(vy + vh);
    let hole_ok = hole_r > hole_l && hole_b > hole_t;

    let panels: [(i32, i32, i32, i32); 4] = if hole_ok {
        [
            (vx, vy, vw, hole_t - vy),
            (vx, hole_b, vw, vy + vh - hole_b),
            (vx, hole_t, hole_l - vx, hole_b - hole_t),
            (hole_r, hole_t, vx + vw - hole_r, hole_b - hole_t),
        ]
    } else {
        [(vx, vy, vw, vh), (0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0)]
    };

    let alpha: u8 = if dark { 168 } else { 158 };
    let mut created = 0usize;
    for (i, (x, y, w, h)) in panels.into_iter().enumerate() {
        if w <= 0 || h <= 0 {
            continue;
        }
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED,
            class_name.as_ptr(),
            std::ptr::null(),
            WS_POPUP | WS_VISIBLE,
            x,
            y,
            w,
            h,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null_mut(),
        );
        if hwnd.is_null() {
            tracing::error!("Dimmer: CreateWindowExW a échoué (panneau {i})");
            continue;
        }
        apply_frosted_glass(hwnd, dark);
        let _ = SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        ShowWindow(hwnd, SW_SHOW);
        SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, SWP_SHOWWINDOW);
        if created == 0 {
            const VK_ESCAPE: u32 = 0x1B;
            let _ = RegisterHotKey(hwnd, ESCAPE_HOTKEY_ID, MOD_NOREPEAT, VK_ESCAPE);
        }
        if let Ok(mut guard) = dimmer_hwnds().lock() {
            guard.push(hwnd as isize);
        }
        created += 1;
    }

    DIMMER_THREAD_ID.store(
        windows_sys::Win32::System::Threading::GetCurrentThreadId(),
        Ordering::SeqCst,
    );

    tracing::info!(
        "Dimmer verre {created} panneaux, écran {vw}x{vh} @ {vx},{vy}, trou {hole_l},{hole_t}-{hole_r},{hole_b}"
    );
}

#[cfg(target_os = "windows")]
unsafe fn apply_frosted_glass(hwnd: windows_sys::Win32::Foundation::HWND, dark: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmEnableBlurBehindWindow, DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE,
        DWM_BB_ENABLE, DWM_BLURBEHIND,
    };

    let dark_mode: u32 = if dark { 1 } else { 0 };
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
        &dark_mode as *const _ as *const std::ffi::c_void,
        4,
    );
    let bb = DWM_BLURBEHIND {
        dwFlags: DWM_BB_ENABLE,
        fEnable: 1,
        hRgnBlur: std::ptr::null_mut(),
        fTransitionOnMaximized: 0,
    };
    let _ = DwmEnableBlurBehindWindow(hwnd, &bb);
    let tint = if dark {
        (15_u8, 23, 42, 140)
    } else {
        (248_u8, 250, 252, 150)
    };
    set_window_acrylic(hwnd, tint);
}

#[cfg(target_os = "windows")]
unsafe fn set_window_acrylic(
    hwnd: windows_sys::Win32::Foundation::HWND,
    color: (u8, u8, u8, u8),
) {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::{BOOL, HWND};
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};

    #[repr(C)]
    struct AccentPolicy {
        accent_state: u32,
        accent_flags: u32,
        gradient_color: u32,
        animation_id: u32,
    }
    #[repr(C)]
    struct AttribData {
        attrib: u32,
        pv_data: *mut c_void,
        cb_data: usize,
    }
    type SetWindowCompositionAttribute = unsafe extern "system" fn(HWND, *mut AttribData) -> BOOL;
    const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;

    let module = LoadLibraryA(b"user32.dll\0".as_ptr());
    if module.is_null() {
        return;
    }
    let Some(proc) = GetProcAddress(module, b"SetWindowCompositionAttribute\0".as_ptr()) else {
        return;
    };
    let set: SetWindowCompositionAttribute = std::mem::transmute(proc);
    let mut alpha = color.3;
    if alpha == 0 {
        alpha = 1;
    }
    let mut policy = AccentPolicy {
        accent_state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
        accent_flags: 0,
        gradient_color: color.0 as u32
            | ((color.1 as u32) << 8)
            | ((color.2 as u32) << 16)
            | ((alpha as u32) << 24),
        animation_id: 0,
    };
    let mut data = AttribData {
        attrib: 0x13,
        pv_data: &mut policy as *mut _ as *mut c_void,
        cb_data: std::mem::size_of::<AccentPolicy>(),
    };
    let _ = set(hwnd, &mut data);
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn dimmer_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, HTCLIENT, MA_NOACTIVATE, WM_CLOSE, WM_ERASEBKGND, WM_HOTKEY, WM_KEYDOWN,
        WM_MOUSEACTIVATE, WM_NCHITTEST, WM_SYSKEYDOWN,
    };
    const VK_ESCAPE: usize = 0x1B;
    match msg {
        WM_NCHITTEST => HTCLIENT as isize,
        WM_MOUSEACTIVATE => MA_NOACTIVATE as isize,
        WM_ERASEBKGND => 1,
        WM_PRIORITY_DESTROY | WM_CLOSE => {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::UnregisterHotKey;
            use windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow;
            let _ = UnregisterHotKey(hwnd, ESCAPE_HOTKEY_ID);
            let _ = DestroyWindow(hwnd);
            0
        }
        WM_HOTKEY if wparam == ESCAPE_HOTKEY_ID as usize => {
            request_dismiss();
            0
        }
        WM_KEYDOWN | WM_SYSKEYDOWN if wparam == VK_ESCAPE => {
            request_dismiss();
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
