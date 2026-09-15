use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub db_url: String,
    pub ldap_host: String,
    pub ldap_port: u16,
    pub ldap_base_dn: String,
    pub ldap_user_attribute: String,
    pub ldap_use_tls: bool,
    pub app_name: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            db_url: String::new(),
            ldap_host: String::new(),
            ldap_port: 389,
            ldap_base_dn: String::new(),
            ldap_user_attribute: "sAMAccountName".to_string(),
            ldap_use_tls: false,
            app_name: "Enterprise Chat".to_string(),
        }
    }
}

impl AppConfig {
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
