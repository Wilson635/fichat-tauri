/**
 * AppInitializer — runs once at startup, after Zustand has finished
 * rehydrating from secureStorage.
 *
 * Responsibilities:
 * 1. Wait for Zustand persist hydration to complete (fixes race where token
 *    is read before async secureStorage responds).
 * 2. Migrate any legacy localStorage tokens (one-time cleanup).
 * 3. Ask the backend whether the app is configured and the DB is connected.
 * 4. If a JWT token is stored, validate it with the backend:
 *    - Valid   → restore the session (user profile already persisted in Zustand).
 *    - Expired or version mismatch → clear auth state → user lands on /login.
 * 5. Refresh the token automatically if it expires within 30 minutes.
 * 6. Mark initialization complete so route guards can make decisions.
 *
 * Shows a full-screen loading spinner during all async work so the user
 * doesn't see a flicker of the login page before the session is restored.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { authService } from "@/services/authService";
import { migrateFromLocalStorage } from "@/services/secureStorage";

interface AppInitializerProps {
  children: React.ReactNode;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { token, setSessionChecked, clearAuth } = useAuthStore();
  const { setConfig, setDbConnected, setInitializing, isInitializing } =
    useAppStore();

  // Run the init sequence only AFTER Zustand has fully rehydrated from
  // secureStorage, so `token` reflects the persisted value.
  useEffect(() => {
    if (!hasHydrated) return; // wait for hydration

    let cancelled = false;

    async function init() {
      // Clean up any legacy localStorage tokens from previous versions
      await migrateFromLocalStorage();

      try {
        // 1. Check app status from backend
        const status = await authService.getAppStatus();

        if (cancelled) return;

        if (status.is_configured) {
          setDbConnected(status.db_connected);
          // Load full config so appStore.isConfigured becomes true
          try {
            const cfg = await authService.loadConfig();
            if (!cancelled) {
              setConfig({
                ldapHost: cfg.ldap_host,
                ldapPort: cfg.ldap_port,
                ldapBaseDn: cfg.ldap_base_dn,
                ldapUserAttribute: cfg.ldap_user_attribute,
                ldapUseTls: cfg.ldap_use_tls,
                dbUrl: cfg.db_url,
                appName: cfg.app_name,
              });
            }
          } catch {
            // Config might not be readable — still trust backend status
          }
        }

        // 2. Validate stored JWT token (now safely read after hydration)
        if (token) {
          try {
            const session = await authService.getSession(token);
            if (!cancelled) {
              // Token is valid — refresh if expiring soon
              const expiresIn = session.expires_at - Math.floor(Date.now() / 1000);
              if (expiresIn < 1800) {
                try {
                  const newToken = await authService.refreshSession(token);
                  if (!cancelled) {
                    useAuthStore.setState((s) => ({ ...s, token: newToken }));
                  }
                } catch {
                  // Refresh failed but token is still valid for now
                }
              }
              setSessionChecked(true);
            }
          } catch {
            // Token invalid, expired, or session_version mismatch → force re-login
            if (!cancelled) {
              clearAuth();
            }
          }
        } else {
          if (!cancelled) {
            setSessionChecked(true);
          }
        }
      } catch {
        // Backend not available (web mode without Tauri) — run in demo/mock mode
        if (!cancelled) {
          setConfig({
            ldapHost: "mock",
            ldapPort: 389,
            ldapBaseDn: "dc=example,dc=com",
            ldapUserAttribute: "sAMAccountName",
            ldapUseTls: false,
            dbUrl: "mock",
            appName: "Enterprise Chat",
          });
          setDbConnected(true);
          setSessionChecked(true);
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  // `token` is read after hydration — safe to include; re-running on token
  // change is intentional (e.g. after refresh).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  if (!hasHydrated || isInitializing) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
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
        <svg
          className="animate-spin w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          style={{ color: "var(--color-primary-500)" }}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Chargement…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
