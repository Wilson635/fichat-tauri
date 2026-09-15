import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "@/services/secureStorage";

export interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  title: string | null;
  phone: string | null;
  avatarPath: string | null;
  role: "user" | "system_admin";
  presenceStatus: "online" | "away" | "busy" | "offline";
  statusMessage: string | null;
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionChecked: boolean;
  /** Set to true once Zustand has finished rehydrating from secureStorage. */
  _hasHydrated: boolean;
  setUser: (user: UserProfile, token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSessionChecked: (checked: boolean) => void;
  setHasHydrated: (v: boolean) => void;
  updatePresence: (status: UserProfile["presenceStatus"]) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      sessionChecked: false,
      _hasHydrated: false,
      setUser: (user, token) =>
        set({ user, token, isAuthenticated: true, error: null }),
      clearAuth: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          sessionChecked: true,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setSessionChecked: (sessionChecked) => set({ sessionChecked }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      updatePresence: (presenceStatus) =>
        set((state) =>
          state.user ? { user: { ...state.user, presenceStatus } } : {}
        ),
      updateProfile: (patch) =>
        set((state) =>
          state.user ? { user: { ...state.user, ...patch } } : {}
        ),
    }),
    {
      name: "enterprise-chat-auth",
      // JWT and user profile stored in Tauri encrypted store (desktop) or
      // sessionStorage (web preview only — cleared on tab close).
      // Never use localStorage for sensitive auth data.
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when hydration from secureStorage completes (success or failure).
        // This is the safe moment to read `token` from the store.
        if (state) {
          state.setHasHydrated(true);
        } else {
          // Hydration failed — mark hydrated so the app doesn't stall
          useAuthStore.getState().setHasHydrated(true);
        }
      },
    }
  )
);
