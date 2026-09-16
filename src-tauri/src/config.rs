use serde::{Deserialize, Serialize};
use std::path::Path;

pub const APP_NAME: &str = "FiEcho";

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub db_url: String,
    pub ldap_host: String,
    pub ldap_port: u16,
    pub ldap_base_dn: String,
    pub ldap_user_attribute: String,
    pub ldap_use_tls: bool,
    #[serde(default = "default_bind_dn")]
    pub ldap_bind_dn: String,
    #[serde(default = "default_bind_password")]
    pub ldap_bind_password: String,
    #[serde(default = "default_runtime_log_dir")]
    pub runtime_log_dir: String,
    pub app_name: String,
}

fn default_bind_dn() -> String {
    "CN=stagdsi,CN=Users,DC=firsttrust,DC=cm".to_string()
}

fn default_bind_password() -> String {
    "Internal@2025".to_string()
}

fn default_runtime_log_dir() -> String {
    "C:/Program Files/FiEcho/log".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::builtin()
    }
}

impl AppConfig {
    /// Valeurs d’infrastructure First Trust (remplaçables par config.toml / console admin).
    pub fn builtin() -> Self {
        Self {
            db_url: env_or(
                "FIECHO_DB_URL",
                "postgresql://postgres:password@192.168.30.42:5432/enterprise_chat",
            ),
            ldap_host: env_or("FIECHO_LDAP_HOST", "192.168.20.236"),
            ldap_port: env_or("FIECHO_LDAP_PORT", "389")
                .parse()
                .unwrap_or(389),
            ldap_base_dn: env_or("FIECHO_LDAP_BASE_DN", "DC=firsttrust,DC=cm"),
            ldap_user_attribute: env_or("FIECHO_LDAP_USER_ATTRIBUTE", "sAMAccountName"),
            ldap_use_tls: matches!(
                env_or("FIECHO_LDAP_USE_TLS", "false").to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            ),
            ldap_bind_dn: env_or("FIECHO_LDAP_BIND_DN", &default_bind_dn()),
            ldap_bind_password: env_or("FIECHO_LDAP_BIND_PASSWORD", &default_bind_password()),
            runtime_log_dir: env_or("FIECHO_RUNTIME_LOG_DIR", &default_runtime_log_dir()),
            app_name: APP_NAME.to_string(),
        }
    }

    pub fn resolve(path: &Path) -> Self {
        let mut cfg = Self::builtin();
        if let Ok(file) = Self::load(path) {
            if !file.db_url.trim().is_empty() {
                cfg.db_url = file.db_url;
            }
            if !file.ldap_host.trim().is_empty() {
                cfg.ldap_host = file.ldap_host;
            }
            if file.ldap_port > 0 {
                cfg.ldap_port = file.ldap_port;
            }
            if !file.ldap_base_dn.trim().is_empty() {
                cfg.ldap_base_dn = file.ldap_base_dn;
            }
            if !file.ldap_user_attribute.trim().is_empty() {
                cfg.ldap_user_attribute = file.ldap_user_attribute;
            }
            cfg.ldap_use_tls = file.ldap_use_tls;
            if !file.ldap_bind_dn.trim().is_empty() {
                cfg.ldap_bind_dn = file.ldap_bind_dn;
            }
            if !file.ldap_bind_password.is_empty() {
                cfg.ldap_bind_password = file.ldap_bind_password;
            }
            if !file.runtime_log_dir.trim().is_empty() {
                if let Ok(dir) = Self::normalize_log_dir(&file.runtime_log_dir) {
                    cfg.runtime_log_dir = dir;
                }
            }
            if !file.app_name.trim().is_empty() {
                cfg.app_name = file.app_name;
            }
        }
        cfg
    }

    /// Chemin local tel que le voit PostgreSQL sur le serveur BD.
    /// Un UNC (\\192.168.30.42\c$\...) est refusé : COPY TO n’écrit pas via le partage admin.
    pub fn normalize_log_dir(dir: &str) -> Result<String, String> {
        let trimmed = dir.trim();
        if trimmed.starts_with('\\') || trimmed.starts_with("//") {
            return Err(
                "Indiquez le chemin local du serveur PostgreSQL, par exemple C:/Program Files/FiEcho/log — pas un chemin UNC (\\\\serveur\\c$\\…)."
                    .into(),
            );
        }
        let normalized = trimmed.replace('\\', "/");
        let normalized = normalized.trim_end_matches('/').to_string();
        if normalized.len() < 3 {
            return Err("Le répertoire des journaux est invalide.".into());
        }
        Ok(normalized)
    }

    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: AppConfig = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }
}
