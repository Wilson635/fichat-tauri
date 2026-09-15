import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "@/services/secureStorage";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "green" | "blue" | "purple" | "orange" | "red";
export type FontSize = "small" | "medium" | "large";
export type ChatBackground =
  | "default"         // soft teal / warm-gray mesh
  | "white"           // ivory paper
  | "dark"            // product night
  | "pattern-dots"    // linen weave
  | "pattern-bubble"  // diamond lattice
  | "slate"           // cool steel office
  | "navy"            // executive navy + gold
  | "sage"            // muted sage
  | "graphite"        // fine grain charcoal
  | "sand"            // warm sandstone
  | "frost"           // icy blue
  | "horizon"         // dusk bands
  | "grid"            // architectural blueprint
  | "silk"            // diagonal satin sheen
  | "ink";            // indigo ink

/** Map legacy ChatBackground ids (from old persisted data) to current ids. */
const LEGACY_BG_MAP: Record<string, ChatBackground> = {
  light:    "white",
  pattern1: "pattern-dots",
  pattern2: "pattern-bubble",
};

export const RAIL_WIDTH = 64;
export const SIDEBAR_LIST_DEFAULT = 420;
export const SIDEBAR_LIST_MIN = 300;
export const SIDEBAR_LIST_MAX = 560;
const MAIN_MIN_WIDTH = 400;

export function clampSidebarListWidth(
  width: unknown,
  viewport = typeof window !== "undefined" ? window.innerWidth : 1440,
): number {
  const n = Number(width);
  const fallback = Number.isFinite(n) ? n : SIDEBAR_LIST_DEFAULT;
  const maxByViewport = Math.max(SIDEBAR_LIST_MIN, viewport - RAIL_WIDTH - MAIN_MIN_WIDTH);
  return Math.round(Math.min(SIDEBAR_LIST_MAX, maxByViewport, Math.max(SIDEBAR_LIST_MIN, fallback)));
}

function normalizeChatBg(raw: unknown): ChatBackground {
  const valid: ChatBackground[] = [
    "default", "white", "dark", "pattern-dots", "pattern-bubble",
    "slate", "navy", "sage", "graphite", "sand",
    "frost", "horizon", "grid", "silk", "ink",
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
  sidebarWidth: number;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontSize: (size: FontSize) => void;
  setChatBackground: (bg: ChatBackground) => void;
  setSidebarWidth: (width: number) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      accentColor: "green",
      fontSize: "medium",
      chatBackground: "default",
      sidebarWidth: SIDEBAR_LIST_DEFAULT,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setFontSize: (fontSize) => set({ fontSize }),
      setChatBackground: (chatBackground) => set({ chatBackground }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarListWidth(sidebarWidth) }),
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
          state.sidebarWidth = clampSidebarListWidth(state.sidebarWidth);
        }
      },
    }
  )
);
