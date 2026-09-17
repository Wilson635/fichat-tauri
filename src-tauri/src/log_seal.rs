//! Journal runtime scellé (FJE2).
//!
//! Sur disque et en base, chaque ligne est une enveloppe AES-256-GCM.
//! La clé (32 octets) est protégée par DPAPI sur le poste Windows : un dump
//! SQL ou un fichier `.log` copié ailleurs est illisible.
//! L’admin FiEcho déchiffre dans le processus, après authentification.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use zeroize::Zeroize;

const PREFIX: &str = "FJE2.";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
const CRYPTPROTECT_LOCAL_MACHINE: u32 = 0x4;

static KEY: OnceLock<Mutex<[u8; KEY_LEN]>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct OpenedLine {
    pub seq: u64,
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub host: String,
    pub code: String,
}

pub fn init(config_dir: &Path) {
    let path = config_dir.join("log_seal.dpapi");
    let key = load_or_create(&path);
    let _ = KEY.set(Mutex::new(key));
}

pub fn looks_sealed(line: &str) -> bool {
    line.trim_start().starts_with(PREFIX)
}

pub fn event_code(target: &str, message: &str) -> String {
    let mut h = Sha256::new();
    h.update(target.as_bytes());
    h.update([0xa5]);
    let bytes = message.as_bytes();
    h.update(&bytes[..bytes.len().min(64)]);
    let d = h.finalize();
    format!("J-{:02X}{:02X}{:02X}{:02X}", d[0], d[1], d[2], d[3])
}

pub fn seal_line(
    seq: u64,
    timestamp: &str,
    level: &str,
    target: &str,
    message: &str,
    host: &str,
) -> Option<String> {
    let code = event_code(target, message);
    let payload = serde_json::json!({
        "s": seq,
        "t": timestamp,
        "l": level,
        "g": target,
        "m": scrub(message),
        "h": host,
        "c": code,
    });
    let plain = payload.to_string();
    with_key(|key| encrypt(key, plain.as_bytes()))?
}

pub fn open_line(line: &str) -> Option<OpenedLine> {
    let line = line.trim();
    if looks_sealed(line) {
        return open_sealed(line);
    }
    parse_legacy(line)
}

fn open_sealed(line: &str) -> Option<OpenedLine> {
    let rest = line.trim_start().strip_prefix(PREFIX)?;
    let packed = URL_SAFE_NO_PAD.decode(rest.as_bytes()).ok()?;
    if packed.len() < NONCE_LEN + 16 {
        return None;
    }
    let (nonce, ct) = packed.split_at(NONCE_LEN);
    let plain = with_key(|key| decrypt(key, nonce, ct))??;
    let v: serde_json::Value = serde_json::from_slice(&plain).ok()?;
    Some(OpenedLine {
        seq: v.get("s").and_then(|x| x.as_u64()).unwrap_or(0),
        timestamp: v
            .get("t")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        level: v
            .get("l")
            .and_then(|x| x.as_str())
            .unwrap_or("INFO")
            .to_string(),
        target: v
            .get("g")
            .and_then(|x| x.as_str())
            .unwrap_or("-")
            .to_string(),
        message: v
            .get("m")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        host: v
            .get("h")
            .and_then(|x| x.as_str())
            .unwrap_or("-")
            .to_string(),
        code: v
            .get("c")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| event_code("-", "")),
    })
}

fn parse_legacy(line: &str) -> Option<OpenedLine> {
    if line.is_empty() {
        return None;
    }
    Some(OpenedLine {
        seq: 0,
        timestamp: String::new(),
        level: "INFO".into(),
        target: "legacy".into(),
        message: line.to_string(),
        host: String::new(),
        code: "J-LEGACY".into(),
    })
}

pub fn open_archive(contents: &str) -> Vec<OpenedLine> {
    contents
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(open_line)
        .collect()
}

fn with_key<T>(f: impl FnOnce(&[u8; KEY_LEN]) -> T) -> Option<T> {
    let guard = KEY.get()?.lock().ok()?;
    Some(f(&*guard))
}

fn encrypt(key: &[u8; KEY_LEN], plain: &[u8]) -> Option<String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; NONCE_LEN];
    fill_random(&mut nonce);
    let ct = cipher.encrypt(Nonce::from_slice(&nonce), plain).ok()?;
    let mut packed = Vec::with_capacity(NONCE_LEN + ct.len());
    packed.extend_from_slice(&nonce);
    packed.extend_from_slice(&ct);
    Some(format!("{PREFIX}{}", URL_SAFE_NO_PAD.encode(packed)))
}

fn decrypt(key: &[u8; KEY_LEN], nonce: &[u8], ct: &[u8]) -> Option<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(Nonce::from_slice(nonce), ct).ok()
}

fn fill_random(buf: &mut [u8]) {
    if getrandom::getrandom(buf).is_ok() {
        return;
    }
    let a = uuid::Uuid::new_v4();
    let b = uuid::Uuid::new_v4();
    let mut tmp = [0u8; 32];
    tmp[..16].copy_from_slice(a.as_bytes());
    tmp[16..].copy_from_slice(b.as_bytes());
    let n = buf.len().min(32);
    buf[..n].copy_from_slice(&tmp[..n]);
}

fn load_or_create(path: &Path) -> [u8; KEY_LEN] {
    if let Ok(blob) = std::fs::read(path) {
        if let Some(key) = unwrap_key(&blob) {
            return key;
        }
    }
    let mut key = [0u8; KEY_LEN];
    fill_random(&mut key);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Some(wrapped) = wrap_key(&key) {
        let _ = std::fs::write(path, wrapped);
    }
    key
}

fn wrap_key(key: &[u8; KEY_LEN]) -> Option<Vec<u8>> {
    #[cfg(windows)]
    unsafe {
        return dpapi_protect(key);
    }
    #[cfg(not(windows))]
    {
        Some(key.to_vec())
    }
}

fn unwrap_key(blob: &[u8]) -> Option<[u8; KEY_LEN]> {
    #[cfg(windows)]
    unsafe {
        if let Some(raw) = dpapi_unprotect(blob) {
            if raw.len() == KEY_LEN {
                let mut key = [0u8; KEY_LEN];
                key.copy_from_slice(&raw);
                return Some(key);
            }
        }
    }
    if blob.len() == KEY_LEN {
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(blob);
        return Some(key);
    }
    None
}

#[cfg(windows)]
unsafe fn dpapi_protect(key: &[u8; KEY_LEN]) -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: key.len() as u32,
        pbData: key.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = CryptProtectData(
        &mut input,
        std::ptr::null(),
        std::ptr::null(),
        std::ptr::null(),
        std::ptr::null(),
        CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE,
        &mut output,
    );
    if ok == 0 || output.pbData.is_null() || output.cbData == 0 {
        return None;
    }
    let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
    let wrapped = slice.to_vec();
    let _ = LocalFree(output.pbData as _);
    Some(wrapped)
}

#[cfg(windows)]
unsafe fn dpapi_unprotect(blob: &[u8]) -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let mut copy = blob.to_vec();
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: copy.len() as u32,
        pbData: copy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = CryptUnprotectData(
        &mut input,
        std::ptr::null_mut(),
        std::ptr::null(),
        std::ptr::null(),
        std::ptr::null(),
        CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE,
        &mut output,
    );
    copy.zeroize();
    if ok == 0 || output.pbData.is_null() || output.cbData == 0 {
        return None;
    }
    let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
    let raw = slice.to_vec();
    let _ = LocalFree(output.pbData as _);
    Some(raw)
}

pub fn sanitize(s: &str) -> String {
    scrub(s)
}

fn scrub(s: &str) -> String {
    let mut out = s.to_string();
    if let Some(scheme) = out.find("://") {
        let rest_at = scheme + 3;
        if let Some(rel_at) = out[rest_at..].find('@') {
            let cred = &out[rest_at..rest_at + rel_at];
            if cred.contains(':') {
                out.replace_range(rest_at..rest_at + rel_at, "****:****");
            }
        }
    }
    for needle in [
        "password=",
        "passwd=",
        "secret=",
        "token=",
        "jwt=",
        "api_key=",
        "bind_password=",
    ] {
        if let Some(i) = out.to_ascii_lowercase().find(needle) {
            let start = i + needle.len();
            let end = out[start..]
                .find(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == '"')
                .map(|n| start + n)
                .unwrap_or(out.len());
            if end > start {
                out.replace_range(start..end, "****");
            }
        }
    }
    scrub_addresses(&out)
}

/// Masque IPv4 / IPv6 (et port associé) pour un journal type Metabase.
fn scrub_addresses(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(n) = consume_bracketed_addr(&chars, i) {
            out.push_str("#addr");
            i += n;
            continue;
        }
        if let Some(n) = consume_ipv4(&chars, i) {
            let prev_ok = i == 0 || !chars[i - 1].is_ascii_digit();
            if prev_ok {
                out.push_str("#addr");
                i += n;
                continue;
            }
        }
        if let Some(n) = consume_ipv6(&chars, i) {
            out.push_str("#addr");
            i += n;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn consume_bracketed_addr(s: &[char], i: usize) -> Option<usize> {
    if s.get(i) != Some(&'[') {
        return None;
    }
    let rel = s[i + 1..].iter().position(|c| *c == ']')?;
    let inner = &s[i + 1..i + 1 + rel];
    if !inner.contains(&':') {
        return None;
    }
    let mut n = 1 + rel + 1;
    n += consume_colon_port(&s[i + n..]);
    Some(n)
}

fn consume_ipv4(s: &[char], i: usize) -> Option<usize> {
    let mut j = i;
    for part in 0..4 {
        if part > 0 {
            if s.get(j) != Some(&'.') {
                return None;
            }
            j += 1;
        }
        let mut val = 0u32;
        let mut digits = 0u32;
        while j < s.len() && s[j].is_ascii_digit() {
            val = val * 10 + s[j].to_digit(10).unwrap_or(0);
            if val > 255 || digits >= 3 {
                return None;
            }
            digits += 1;
            j += 1;
        }
        if digits == 0 {
            return None;
        }
    }
    j += consume_colon_port(&s[j..]);
    Some(j - i)
}

fn consume_ipv6(s: &[char], i: usize) -> Option<usize> {
    if i + 1 >= s.len() {
        return None;
    }
    let start_ok = s[i] == ':' && s[i + 1] == ':';
    let hex_start = s[i].is_ascii_hexdigit() && s.get(i + 1) == Some(&':');
    if !start_ok && !hex_start {
        return None;
    }
    let mut j = i;
    let mut colons = 0;
    let mut hexes = 0;
    while j < s.len() {
        let c = s[j];
        if c == ':' {
            colons += 1;
            j += 1;
            continue;
        }
        if c.is_ascii_hexdigit() {
            hexes += 1;
            j += 1;
            continue;
        }
        break;
    }
    if colons < 2 || hexes < 1 {
        return None;
    }
    j += consume_colon_port(&s[j..]);
    Some(j - i)
}

fn consume_colon_port(s: &[char]) -> usize {
    if s.first() != Some(&':') {
        return 0;
    }
    let mut k = 1;
    let mut digits = 0;
    while k < s.len() && s[k].is_ascii_digit() {
        digits += 1;
        k += 1;
    }
    if digits == 0 {
        0
    } else {
        k
    }
}

pub fn short_target(raw: &str) -> String {
    let t = raw
        .trim_start_matches("enterprise_chat_lib::")
        .trim_start_matches("enterprise_chat::")
        .replace("::", ".");
    if t.is_empty() {
        "core.core".into()
    } else {
        t
    }
}

pub fn stamp_local() -> String {
    let n = chrono::Local::now();
    format!("{},{:03}", n.format("%Y-%m-%d %H:%M:%S"), n.timestamp_subsec_millis())
}
