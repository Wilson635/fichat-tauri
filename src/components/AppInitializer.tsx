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
import { authService, toStoreConfig } from "@/services/authService";
import { migrateFromLocalStorage } from "@/services/secureStorage";
import { Icon } from "@/components/Icon";
import { AppLogo } from "@/components/AppLogo";
import { startRuntimeLogCapture } from "@/store/runtimeLogStore";
import { APP_NAME } from "@/brand";

interface AppInitializerProps {
  children: React.ReactNode;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const { token, setSessionChecked, clearAuth } = useAuthStore();
  const { setConfig, setDbConnected, setInitializing, isInitializing } =
    useAppStore();

  useEffect(() => {
    startRuntimeLogCapture().catch(() => {});
  }, []);

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

        if (status.is_configured || status.db_connected) {
          setDbConnected(status.db_connected);
        }
        try {
          const cfg = await authService.loadConfig();
          if (!cancelled) {
            setConfig(toStoreConfig(cfg));
            setDbConnected(status.db_connected);
          }
        } catch {
          // Config might not be readable — still trust backend status
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
            ldapBindDn: "",
            dbUrl: "mock",
            runtimeLogDir: "",
            appName: APP_NAME,
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
        <AppLogo size={72} />
        <Icon name="loader" size={22} className="animate-spin" style={{ color: "var(--color-primary-500)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Chargement…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
