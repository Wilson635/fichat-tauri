import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { authService } from "@/services/authService";

interface SetupConfig {
  ldapHost: string;
  ldapPort: string;
  ldapBaseDn: string;
  ldapUserAttribute: string;
  ldapUseTls: boolean;
  dbUrl: string;
}

export function SetupPage() {
  const navigate = useNavigate();
  const { setConfig, setDbConnected } = useAppStore();
  const [step, setStep] = useState<"db" | "ldap">("db");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbOk, setDbOk] = useState(false);
  const [config, setConfigState] = useState<SetupConfig>({
    ldapHost: "",
    ldapPort: "389",
    ldapBaseDn: "",
    ldapUserAttribute: "sAMAccountName",
    ldapUseTls: false,
    dbUrl: "postgresql://user:password@localhost:5432/enterprise_chat",
  });

  const handleChange = (key: keyof SetupConfig, value: string | boolean) => {
    setConfigState((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const testDb = async () => {
    setLoading(true);
    setError(null);
    try {
      await authService.testDbConnection(config.dbUrl);
      setDbOk(true);
      setDbConnected(true);
      setStep("ldap");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      await authService.saveConfig({
        db_url: config.dbUrl,
        ldap_host: config.ldapHost,
        ldap_port: parseInt(config.ldapPort, 10),
        ldap_base_dn: config.ldapBaseDn,
        ldap_user_attribute: config.ldapUserAttribute,
        ldap_use_tls: config.ldapUseTls,
      });
      setConfig({
        ldapHost: config.ldapHost,
        ldapPort: parseInt(config.ldapPort, 10),
        ldapBaseDn: config.ldapBaseDn,
        ldapUserAttribute: config.ldapUserAttribute,
        ldapUseTls: config.ldapUseTls,
        dbUrl: config.dbUrl,
        appName: "Enterprise Chat",
      });
      navigate("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-sm outline-none border focus:ring-2 transition-all";
  const inputStyle = {
    backgroundColor: "var(--color-input-bg)",
    color: "var(--color-text-primary)",
    borderColor: "var(--color-border)",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--color-surface-secondary)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl p-8 animate-fade-in"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--color-primary-500)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            FiChat
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            Configuration initiale
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center mb-6">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{
                backgroundColor:
                  step === "db" || dbOk
                    ? "var(--color-primary-500)"
                    : "var(--color-surface-secondary)",
              }}
            >
              {dbOk ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : "1"}
            </div>
            <span
              className="text-sm font-medium"
              style={{
                color:
                  step === "db"
                    ? "var(--color-primary-500)"
                    : "var(--color-text-muted)",
              }}
            >
              Base de données
            </span>
          </div>

          <div
            className="flex-1 h-px mx-3"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor:
                  step === "ldap"
                    ? "var(--color-primary-500)"
                    : "var(--color-surface-secondary)",
                color:
                  step === "ldap" ? "white" : "var(--color-text-muted)",
              }}
            >
              2
            </div>
            <span
              className="text-sm font-medium"
              style={{
                color:
                  step === "ldap"
                    ? "var(--color-primary-500)"
                    : "var(--color-text-muted)",
              }}
            >
              Active Directory
            </span>
          </div>
        </div>

        {/* ─── Step 1 : Database ─────────────────────────────────────────── */}
        {step === "db" && (
          <div className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                URL de connexion PostgreSQL
              </label>
              <input
                type="text"
                value={config.dbUrl}
                onChange={(e) => handleChange("dbUrl", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="postgresql://user:pass@host:5432/enterprise_chat"
                autoFocus
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Format : <code>postgresql://utilisateur:motdepasse@hôte:port/base</code>
              </p>
            </div>

            {error && (
              <div
                className="rounded-lg p-3 text-sm flex items-start gap-2"
                style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#dc2626" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              onClick={testDb}
              disabled={loading || !config.dbUrl.trim()}
              className="w-full py-2.5 rounded-lg font-medium text-white text-sm transition-opacity disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Test de connexion…
                </span>
              ) : (
                "Tester et continuer →"
              )}
            </button>
          </div>
        )}

        {/* ─── Step 2 : LDAP ─────────────────────────────────────────────── */}
        {step === "ldap" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Serveur LDAP / AD
                </label>
                <input
                  type="text"
                  value={config.ldapHost}
                  onChange={(e) => handleChange("ldapHost", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="ad.entreprise.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Port
                </label>
                <input
                  type="number"
                  value={config.ldapPort}
                  onChange={(e) => handleChange("ldapPort", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  min={1}
                  max={65535}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                Base DN
              </label>
              <input
                type="text"
                value={config.ldapBaseDn}
                onChange={(e) => handleChange("ldapBaseDn", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="DC=entreprise,DC=com"
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Le chemin LDAP racine de votre domaine Active Directory.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                Attribut d'identifiant
              </label>
              <input
                type="text"
                value={config.ldapUserAttribute}
                onChange={(e) => handleChange("ldapUserAttribute", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="sAMAccountName"
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Généralement <code>sAMAccountName</code> (Windows) ou <code>uid</code> (OpenLDAP).
              </p>
            </div>

            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ backgroundColor: "var(--color-surface-secondary)" }}
            >
              <input
                type="checkbox"
                id="tls"
                checked={config.ldapUseTls}
                onChange={(e) => handleChange("ldapUseTls", e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: "var(--color-primary-500)" }}
              />
              <label htmlFor="tls" className="text-sm cursor-pointer select-none" style={{ color: "var(--color-text-secondary)" }}>
                <strong>TLS / LDAPS</strong> — Chiffrer la connexion LDAP (port 636)
              </label>
            </div>

            {error && (
              <div
                className="rounded-lg p-3 text-sm flex items-start gap-2"
                style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#dc2626" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setStep("db"); setError(null); }}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm border transition-colors"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                ← Retour
              </button>
              <button
                onClick={saveConfig}
                disabled={loading || !config.ldapHost.trim() || !config.ldapBaseDn.trim()}
                className="flex-1 py-2.5 rounded-lg font-medium text-white text-sm transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--color-primary-500)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enregistrement…
                  </span>
                ) : (
                  "Terminer la configuration ✓"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
