import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";
import { Icon } from "@/components/Icon";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setLoading, setError, isLoading, error, isAuthenticated } =
    useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);

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
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(900px 500px at 10% -10%, rgba(0,168,132,0.16), transparent 50%), radial-gradient(700px 400px at 100% 100%, rgba(15,23,42,0.08), transparent 50%), var(--color-surface-secondary)",
      }}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden animate-fade-in"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 48px -16px rgba(15,23,42,0.18)",
        }}
      >
        <div className="p-9">
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              <Icon name="message" size={26} style={{ color: "#fff" }} strokeWidth={1.8} />
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              FiChat
            </h1>
            <p className="text-[13px] mt-1.5 font-medium" style={{ color: "var(--color-text-muted)" }}>
              Connexion Active Directory
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                Nom d'utilisateur
              </label>
              <div
                className="flex items-center gap-2.5 rounded-xl px-3 h-11"
                style={{ backgroundColor: "var(--color-input-bg)", border: "1px solid var(--color-border)" }}
              >
                <Icon name="user" size={16} style={{ color: "var(--color-text-muted)" }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  autoComplete="username"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                  placeholder="Login Windows"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                Mot de passe
              </label>
              <div
                className="flex items-center gap-2.5 rounded-xl px-3 h-11"
                style={{ backgroundColor: "var(--color-input-bg)", border: "1px solid var(--color-border)" }}
              >
                <Icon name="lock" size={16} style={{ color: "var(--color-text-muted)" }} />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="shrink-0" tabIndex={-1} aria-label={showPass ? "Masquer" : "Afficher"}>
                  <Icon name={showPass ? "eyeOff" : "eye"} size={16} style={{ color: "var(--color-text-muted)" }} />
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl p-3 text-[13px] flex items-start gap-2" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#dc2626" }} role="alert">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {attempts >= 3 && !error && (
              <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
                Trop de tentatives ? Contactez votre administrateur réseau.
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              className="w-full h-11 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-60 mt-1"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Icon name="loader" size={16} className="animate-spin" />
                  Connexion…
                </span>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          <p className="text-center text-[11px] mt-7 flex items-center justify-center gap-1.5 font-medium" style={{ color: "var(--color-text-muted)" }}>
            <Icon name="lock" size={12} />
            Authentification LDAP sécurisée
          </p>
        </div>
      </div>
    </div>
  );
}
