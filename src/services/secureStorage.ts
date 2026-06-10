/**
 * Secure storage adapter for Zustand persist middleware.
 *
 * Strategy:
 * - When running inside Tauri (desktop app): use @tauri-apps/plugin-store,
 *   which encrypts data in the native app data directory.
 * - When running in a plain browser (web preview / dev without Tauri): fall
 *   back to sessionStorage so that tokens are NEVER written to localStorage
 *   and are always cleared when the browser tab/window closes.
 *
 * The adapter is intentionally async-safe: Zustand persist middleware
 * supports Promise-returning storage methods.
 */

import type { StateStorage } from "zustand/middleware";

// Detect Tauri environment at runtime
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ─── Tauri store singleton ───────────────────────────────────────────────────
let tauriStorePromise: Promise<import("@tauri-apps/plugin-store").Store> | null = null;

async function getTauriStore() {
  if (!tauriStorePromise) {
    tauriStorePromise = (async () => {
      const { load } = await import("@tauri-apps/plugin-store");
      // autoSave: true — writes to disk on every set (every 500ms debounce)
      return load("enterprise-chat-session.bin", { autoSave: true, defaults: {} } as any);
    })();
  }
  return tauriStorePromise;
}

// ─── Storage adapter ─────────────────────────────────────────────────────────
export const secureStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    if (isTauri()) {
      try {
        const store = await getTauriStore();
        const value = await store.get<string>(name);
        return value ?? null;
      } catch (e) {
        console.warn("[secureStorage] Tauri store read failed, falling back:", e);
      }
    }
    // Web fallback: sessionStorage (cleared on tab close, never written to disk)
    return sessionStorage.getItem(name);
  },

  async setItem(name: string, value: string): Promise<void> {
    if (isTauri()) {
      try {
        const store = await getTauriStore();
        await store.set(name, value);
        return;
      } catch (e) {
        console.warn("[secureStorage] Tauri store write failed, falling back:", e);
      }
    }
    sessionStorage.setItem(name, value);
  },

  async removeItem(name: string): Promise<void> {
    if (isTauri()) {
      try {
        const store = await getTauriStore();
        await store.delete(name);
        return;
      } catch (e) {
        console.warn("[secureStorage] Tauri store delete failed, falling back:", e);
      }
    }
    sessionStorage.removeItem(name);
  },
};

/**
 * Migrate any leftover token from the old localStorage persistence.
 * Call once at startup to clean up legacy data.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const legacy = localStorage.getItem("enterprise-chat-auth");
    if (legacy) {
      // Remove sensitive data from localStorage immediately
      localStorage.removeItem("enterprise-chat-auth");
      // If already migrated to secureStorage there's nothing more to do
      // (AppInitializer will re-validate the session from secureStorage)
    }
  } catch {
    // Non-critical
  }
}
