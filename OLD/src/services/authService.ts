/**
 * Auth service — wraps Tauri invoke calls with typed responses and
 * user-friendly French error messages. Falls back gracefully when
 * running outside of Tauri (web preview).
 */

import { UserProfile } from "@/store/authStore";

// ─── Tauri invoke helper ────────────────────────────────────────────────────
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Dynamic import so the app doesn't crash in pure web mode
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch (e) {
    // If Tauri is not available (pure web preview), propagate the error as-is
    throw e;
  }
}

// ─── Error normalizer ───────────────────────────────────────────────────────
export function normalizeAuthError(raw: unknown): string {
  const msg = typeof raw === "string" ? raw : String(raw);

  if (/invalidCredentials|49|unwilling|invalid credentials/i.test(msg))
    return "Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe.";
  if (/accountDisabled|disabled|525|account.*disabled/i.test(msg))
    return "Ce compte est désactivé. Contactez votre administrateur.";
  if (/expired|password.*expired|532|mustChangePassword/i.test(msg))
    return "Votre mot de passe a expiré. Changez-le depuis Windows avant de vous reconnecter.";
  if (/lockedOut|locked|lock|523/i.test(msg))
    return "Compte temporairement verrouillé après trop de tentatives. Réessayez dans quelques minutes.";
  if (/connection refused|refused|Cannot connect|network|timeout|inaccessible/i.test(msg))
    return "Impossible de contacter le serveur Active Directory. Vérifiez votre connexion réseau.";
  if (/not configured|non configurée|Application non/i.test(msg))
    return "L'application n'est pas encore configurée. Lancez la configuration initiale.";
  if (/database|base de données|DB/i.test(msg))
    return "Erreur de base de données. Contactez votre administrateur.";

  // Return the raw message if no pattern matches (already French from Rust)
  return msg.replace(/^Error\s*:\s*/i, "");
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface LoginResult {
  user: UserProfile;
  token: string;
}

export interface SessionInfo {
  user_id: number;
  username: string;
  role: string;
  expires_at: number;
}

export interface AppConfig {
  db_url: string;
  ldap_host: string;
  ldap_port: number;
  ldap_base_dn: string;
  ldap_user_attribute: string;
  ldap_use_tls: boolean;
  app_name: string;
}

export interface AppStatus {
  is_configured: boolean;
  db_connected: boolean;
  app_name: string;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Service methods ─────────────────────────────────────────────────────────
export const authService = {
  /**
   * Authenticate against LDAP Active Directory.
   * Returns the user profile and a signed JWT token on success.
   * In web/mock mode, accepts any non-empty credentials.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    if (!isTauri()) {
      if (!username.trim() || !password) {
        throw new Error("Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe.");
      }
      const mockUser: UserProfile = {
        id: 1,
        username: username.trim(),
        displayName: username.trim().replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        email: `${username.trim()}@example.com`,
        department: "Informatique",
        title: "Employé",
        phone: null,
        avatarPath: null,
        role: "user",
        presenceStatus: "online",
        statusMessage: null,
      };
      return { user: mockUser, token: "mock-token-" + Date.now() };
    }
    try {
      const result = await tauriInvoke<{ user: any; token: string }>(
        "cmd_ldap_login",
        { username, password }
      );
      // Normalize the user profile from Rust snake_case to camelCase
      return {
        token: result.token,
        user: mapUserProfile(result.user),
      };
    } catch (e) {
      throw new Error(normalizeAuthError(e));
    }
  },

  /**
   * Invalidate the current session (server-side).
   */
  async logout(token: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await tauriInvoke("cmd_logout", { token });
    } catch {
      // Logout errors are non-critical — always clear local state
    }
  },

  /**
   * Validate a stored JWT token and return session metadata.
   * Throws if the token is expired or invalid.
   */
  async getSession(token: string): Promise<SessionInfo> {
    if (!isTauri()) {
      if (token && token.startsWith("mock-token-")) {
        return { user_id: 1, username: "user", role: "user", expires_at: Math.floor(Date.now() / 1000) + 86400 };
      }
      throw new Error("Session invalide");
    }
    const result = await tauriInvoke<SessionInfo>("cmd_get_session", { token });
    return result;
  },

  /**
   * Refresh a JWT token that is about to expire (within 30 min).
   */
  async refreshSession(token: string): Promise<string> {
    if (!isTauri()) return "mock-token-" + Date.now();
    const newToken = await tauriInvoke<string>("cmd_refresh_session", { token });
    return newToken;
  },

  /**
   * Get the current app status (configured, db connected).
   */
  async getAppStatus(): Promise<AppStatus> {
    if (!isTauri()) {
      return { is_configured: true, db_connected: true, app_name: "Enterprise Chat" };
    }
    return tauriInvoke<AppStatus>("cmd_get_app_status");
  },

  /**
   * Test a PostgreSQL connection URL without saving.
   */
  async testDbConnection(url: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await tauriInvoke("cmd_test_db_connection", { url });
    } catch (e) {
      throw new Error(`Connexion PostgreSQL échouée : ${normalizeAuthError(e)}`);
    }
  },

  /**
   * Save the app configuration and connect to the database.
   */
  async saveConfig(config: Omit<AppConfig, "app_name">): Promise<void> {
    if (!isTauri()) return;
    try {
      await tauriInvoke("cmd_save_config", { config });
    } catch (e) {
      throw new Error(normalizeAuthError(e));
    }
  },

  /**
   * Load the saved configuration.
   */
  async loadConfig(): Promise<AppConfig> {
    if (!isTauri()) {
      return { db_url: "mock", ldap_host: "mock", ldap_port: 389, ldap_base_dn: "dc=example,dc=com", ldap_user_attribute: "sAMAccountName", ldap_use_tls: false, app_name: "Enterprise Chat" };
    }
    return tauriInvoke<AppConfig>("cmd_load_config");
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mapUserProfile(raw: any): UserProfile {
  return {
    id: raw.id ?? 0,
    username: raw.username ?? "",
    displayName: raw.display_name ?? raw.displayName ?? "",
    email: raw.email ?? null,
    department: raw.department ?? null,
    title: raw.title ?? null,
    phone: raw.phone ?? null,
    avatarPath: raw.avatar_path ?? raw.avatarPath ?? null,
    role: (raw.role === "system_admin" ? "system_admin" : "user") as UserProfile["role"],
    presenceStatus: raw.presence_status ?? raw.presenceStatus ?? "online",
    statusMessage: raw.status_message ?? raw.statusMessage ?? null,
  };
}
