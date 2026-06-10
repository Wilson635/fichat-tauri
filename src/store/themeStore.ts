import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "@/services/secureStorage";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "green" | "blue" | "purple" | "orange" | "red";
export type FontSize = "small" | "medium" | "large";
export type ChatBackground =
  | "default"         // WhatsApp beige / dark navy
  | "white"           // clean white / dark purple
  | "dark"            // near-black
  | "pattern-dots"    // subtle dot grid
  | "pattern-bubble"; // WhatsApp-style chat bubble pattern

/** Map legacy ChatBackground ids (from old persisted data) to current ids. */
const LEGACY_BG_MAP: Record<string, ChatBackground> = {
  light:    "white",
  pattern1: "pattern-dots",
  pattern2: "pattern-bubble",
};

function normalizeChatBg(raw: unknown): ChatBackground {
  const valid: ChatBackground[] = [
    "default", "white", "dark", "pattern-dots", "pattern-bubble",
  ];
  const str = String(raw ?? "");
  if (valid.includes(str as ChatBackground)) return str as ChatBackground;
  return LEGACY_BG_MAP[str] ?? "default";
}

/**
 * Storage adapter scoped by authenticated user ID.
 * Keys become `enterprise-chat-theme:<userId>` so each user on a shared
 * device keeps their own appearance settings.
 * Falls back to "anonymous" before login (transient, overwritten on sign-in).
 */
const userScopedStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Lazy import to avoid circular dependency at module load time
    const { useAuthStore } = await import("@/store/authStore");
    const userId = useAuthStore.getState().user?.id ?? "anonymous";
    return secureStorage.getItem(`${name}:${userId}`);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const { useAuthStore } = await import("@/store/authStore");
    const userId = useAuthStore.getState().user?.id ?? "anonymous";
    await secureStorage.setItem(`${name}:${userId}`, value);
  },
  removeItem: async (name: string): Promise<void> => {
    const { useAuthStore } = await import("@/store/authStore");
    const userId = useAuthStore.getState().user?.id ?? "anonymous";
    await secureStorage.removeItem(`${name}:${userId}`);
  },
};

interface ThemeState {
  theme: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  chatBackground: ChatBackground;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontSize: (size: FontSize) => void;
  setChatBackground: (bg: ChatBackground) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      accentColor: "green",
      fontSize: "medium",
      chatBackground: "default",
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setFontSize: (fontSize) => set({ fontSize }),
      setChatBackground: (chatBackground) => set({ chatBackground }),
    }),
    {
      name: "enterprise-chat-theme",
      // Tauri desktop : plugin-store chiffré ; web preview : sessionStorage.
      // The userScopedStorage wrapper appends :<userId> to the key.
      storage: createJSONStorage(() => userScopedStorage),
      // Normalize legacy chatBackground values during rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.chatBackground = normalizeChatBg(state.chatBackground);
        }
      },
    }
  )
);
