import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";
import { isTauri } from "@/services/chatService";
import { Icon } from "@/components/Icon";
import { AuthAlert, AuthField, AuthPrimaryButton, AuthShell } from "@/components/AuthShell";
import { APP_NAME } from "@/brand";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setLoading, setError, isLoading, error, isAuthenticated } =
    useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const from =
        (location.state as { from?: Location })?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const result = await authService.login(username.trim(), password);
      setUser(result.user, result.token);
      const from =
        (location.state as { from?: Location })?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    } catch (e) {
      setAttempts((n) => n + 1);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      headline={`Bienvenue sur ${APP_NAME}`}
      description="Messagerie interne de First Trust. Connectez-vous avec votre identifiant Windows pour rejoindre vos discussions, groupes et fichiers d’équipe."
      features={[
        "Discussions privées et groupes d’équipe",
        "Partage de documents, images et vocaux",
        "Alertes prioritaires et mode Ne pas déranger",
        "Authentification Active Directory, sans compte séparé",
      ]}
      footer={
        isTauri()
          ? "Application de bureau Windows · LDAP / Active Directory"
          : "Aperçu web · LDAP / Active Directory"
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
          Connexion
        </p>
        <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Identifiants du domaine
        </h2>
        <p className="text-[13px] mt-1 mb-7" style={{ color: "var(--color-text-muted)" }}>
          Utilisez le même login que pour votre session Windows.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <AuthField label="Nom d'utilisateur" icon="user" htmlFor="login-username">
            <input
              id="login-username"
              type="text"
              name="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              placeholder="Login Windows"
              disabled={isLoading}
              autoFocus
            />
          </AuthField>

          <AuthField
            label="Mot de passe"
            icon="lock"
            htmlFor="login-password"
            hint={capsLock ? "Verr. maj. activé" : undefined}
          >
            <input
              id="login-password"
              type={showPass ? "text" : "password"}
              name="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
              autoComplete="current-password"
              placeholder="Mot de passe Windows"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="shrink-0"
              tabIndex={-1}
              aria-label={showPass ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              <Icon name={showPass ? "eyeOff" : "eye"} size={16} style={{ color: "var(--color-text-muted)" }} />
            </button>
          </AuthField>

          {error && <AuthAlert>{error}</AuthAlert>}

          {attempts >= 3 && (
            <p className="text-[12px] text-center" style={{ color: "var(--color-text-muted)" }}>
              Trop de tentatives ? Contactez votre administrateur réseau.
            </p>
          )}

          <AuthPrimaryButton disabled={isLoading || !username.trim() || !password}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Icon name="loader" size={16} className="animate-spin" />
                Connexion…
              </span>
            ) : (
              "Se connecter"
            )}
          </AuthPrimaryButton>
        </form>

        <p className="text-center text-[11px] mt-6 flex items-center justify-center gap-1.5 font-medium" style={{ color: "var(--color-text-muted)" }}>
          <Icon name="shield" size={12} />
          Session chiffrée · identifiants non stockés localement
        </p>
      </div>
    </AuthShell>
  );
}
