import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { authService } from "@/services/authService";
import { dbEngineLabel } from "@/utils/dbEngine";
import { Icon } from "@/components/Icon";
import {
  AuthAlert,
  AuthField,
  AuthPrimaryButton,
  AuthShell,
  AuthToggle,
} from "@/components/AuthShell";

interface SetupConfig {
  ldapHost: string;
  ldapPort: string;
  ldapBaseDn: string;
  ldapUserAttribute: string;
  ldapUseTls: boolean;
  dbUrl: string;
}

function StepDot({
  n,
  label,
  active,
  done,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={`flex items-center gap-2 min-w-0 ${onClick ? "" : "pointer-events-none"}`}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
        style={{
          backgroundColor: active || done ? "var(--color-primary-500)" : "var(--color-surface-secondary)",
          color: active || done ? "#fff" : "var(--color-text-muted)",
        }}
      >
        {done && !active ? <Icon name="check" size={13} strokeWidth={2.4} /> : n}
      </span>
      <span
        className="text-[13px] font-semibold truncate"
        style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
      >
        {label}
      </span>
    </button>
  );
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

  const engine = dbEngineLabel(config.dbUrl);
  const engineKnown = engine !== "SGBD" && engine !== "Base de données";

  const handleChange = (key: keyof SetupConfig, value: string | boolean) => {
    setConfigState((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const toggleTls = () => {
    setConfigState((prev) => {
      const next = !prev.ldapUseTls;
      let port = prev.ldapPort;
      if (next && prev.ldapPort === "389") port = "636";
      if (!next && prev.ldapPort === "636") port = "389";
      return { ...prev, ldapUseTls: next, ldapPort: port };
    });
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

  return (
    <AuthShell
      wide
      headline="Configuration initiale"
      description="Reliez FiChat à l’infrastructure de First Trust : le serveur de données, puis l’annuaire Active Directory. Aucun compte local n’est créé."
      features={[
        "Détection automatique du SGBD à partir de l’URL",
        "LDAP / Active Directory pour l’authentification",
        "TLS optionnel (LDAPS, port 636)",
      ]}
      footer="Assistant d’installation · administrateur système"
      aside={
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(232,237,244,0.5)" }}>
            Récapitulatif
          </p>
          {[
            { icon: "database" as const, title: "Serveur de données", value: engineKnown ? engine : "En attente de l’URL" },
            {
              icon: "server" as const,
              title: "Annuaire",
              value: config.ldapHost.trim()
                ? `${config.ldapHost}:${config.ldapPort}${config.ldapUseTls ? " · TLS" : ""}`
                : "Non renseigné",
            },
            {
              icon: "lock" as const,
              title: "Identifiant LDAP",
              value: config.ldapUserAttribute || "sAMAccountName",
            },
          ].map((row) => (
            <div key={row.title} className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(232,237,244,0.8)" }}
              >
                <Icon name={row.icon} size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px]" style={{ color: "rgba(232,237,244,0.5)" }}>{row.title}</p>
                <p className="text-[13px] font-medium truncate text-white">{row.value}</p>
              </div>
            </div>
          ))}
        </div>
      }
    >
      <div
        className="rounded-2xl p-8"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 48px -20px rgba(15,23,42,0.16)",
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--color-primary-600)" }}>
          Installation
        </p>
        <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          {step === "db" ? "Serveur de données" : "Active Directory"}
        </h2>
        <p className="text-[13px] mt-1 mb-6" style={{ color: "var(--color-text-muted)" }}>
          {step === "db"
            ? "Collez l’URL de connexion. Le moteur affiché est lu depuis le schéma, pas figé dans l’application."
            : "Paramètres de l’annuaire d’entreprise pour l’authentification des collaborateurs."}
        </p>

        <div className="flex items-center mb-7">
          <StepDot n={1} label="Données" active={step === "db"} done={dbOk} onClick={dbOk ? () => { setStep("db"); setError(null); } : undefined} />
          <div className="flex-1 h-px mx-3" style={{ backgroundColor: "var(--color-border)" }} />
          <StepDot n={2} label="Annuaire" active={step === "ldap"} done={false} />
        </div>

        {step === "db" && (
          <div className="space-y-4">
            <AuthField
              label="URL de connexion"
              icon="database"
              htmlFor="setup-db-url"
              hint={
                <>
                  Moteur détecté : <strong style={{ color: "var(--color-text-secondary)" }}>{engine}</strong>
                  {" · "}ex. postgresql://utilisateur:motdepasse@hôte:5432/base
                </>
              }
            >
              <input
                id="setup-db-url"
                type="text"
                value={config.dbUrl}
                onChange={(e) => handleChange("dbUrl", e.target.value)}
                placeholder="postgresql://user:pass@host:5432/enterprise_chat"
                autoFocus
                spellCheck={false}
              />
            </AuthField>

            {error && <AuthAlert>{error}</AuthAlert>}

            <AuthPrimaryButton
              type="button"
              onClick={testDb}
              disabled={loading || !config.dbUrl.trim()}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Icon name="loader" size={16} className="animate-spin" />
                  Test de connexion…
                </span>
              ) : (
                "Tester et continuer"
              )}
            </AuthPrimaryButton>
          </div>
        )}

        {step === "ldap" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <AuthField label="Serveur LDAP / AD" icon="server" htmlFor="setup-ldap-host">
                  <input
                    id="setup-ldap-host"
                    type="text"
                    value={config.ldapHost}
                    onChange={(e) => handleChange("ldapHost", e.target.value)}
                    placeholder="ad.entreprise.com"
                    autoFocus
                    spellCheck={false}
                  />
                </AuthField>
              </div>
              <AuthField label="Port" htmlFor="setup-ldap-port">
                <input
                  id="setup-ldap-port"
                  type="number"
                  value={config.ldapPort}
                  onChange={(e) => handleChange("ldapPort", e.target.value)}
                  min={1}
                  max={65535}
                />
              </AuthField>
            </div>

            <AuthField
              label="Base DN"
              icon="globe"
              htmlFor="setup-ldap-dn"
              hint="Chemin LDAP racine du domaine, par ex. DC=entreprise,DC=com"
            >
              <input
                id="setup-ldap-dn"
                type="text"
                value={config.ldapBaseDn}
                onChange={(e) => handleChange("ldapBaseDn", e.target.value)}
                placeholder="DC=entreprise,DC=com"
                spellCheck={false}
              />
            </AuthField>

            <AuthField
              label="Attribut d'identifiant"
              icon="user"
              htmlFor="setup-ldap-attr"
              hint={
                <>
                  Généralement <code>sAMAccountName</code> (Windows) ou <code>uid</code> (OpenLDAP).
                </>
              }
            >
              <input
                id="setup-ldap-attr"
                type="text"
                value={config.ldapUserAttribute}
                onChange={(e) => handleChange("ldapUserAttribute", e.target.value)}
                placeholder="sAMAccountName"
                spellCheck={false}
              />
            </AuthField>

            <AuthToggle
              on={config.ldapUseTls}
              onChange={toggleTls}
              label="TLS / LDAPS"
              description="Chiffrer la connexion à l’annuaire (port 636 recommandé)"
            />

            {error && <AuthAlert>{error}</AuthAlert>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setStep("db"); setError(null); }}
                className="h-11 px-4 rounded-xl font-semibold text-sm border shrink-0"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                Retour
              </button>
              <AuthPrimaryButton
                type="button"
                onClick={saveConfig}
                disabled={loading || !config.ldapHost.trim() || !config.ldapBaseDn.trim()}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Icon name="loader" size={16} className="animate-spin" />
                    Enregistrement…
                  </span>
                ) : (
                  "Terminer la configuration"
                )}
              </AuthPrimaryButton>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
