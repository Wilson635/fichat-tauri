import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { useThemeStore } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { AppInitializer } from "@/components/AppInitializer";
import "@/index.css";

// ─── Accent color palettes ────────────────────────────────────────────────
const accentMap: Record<string, Record<string, string>> = {
  green: {
    "--color-primary-50":  "#e6f7f4",
    "--color-primary-100": "#b3e8df",
    "--color-primary-200": "#80d9ca",
    "--color-primary-300": "#4dcab5",
    "--color-primary-400": "#26bda6",
    "--color-primary-500": "#00a884",
    "--color-primary-600": "#009878",
    "--color-primary-700": "#008469",
    "--color-primary-800": "#00715a",
    "--color-primary-900": "#004d3e",
  },
  blue: {
    "--color-primary-50":  "#eff6ff",
    "--color-primary-100": "#dbeafe",
    "--color-primary-200": "#bfdbfe",
    "--color-primary-300": "#93c5fd",
    "--color-primary-400": "#60a5fa",
    "--color-primary-500": "#0078d4",
    "--color-primary-600": "#0066b3",
    "--color-primary-700": "#005592",
    "--color-primary-800": "#004471",
    "--color-primary-900": "#003050",
  },
  purple: {
    "--color-primary-50":  "#f5f3ff",
    "--color-primary-100": "#ede9fe",
    "--color-primary-200": "#ddd6fe",
    "--color-primary-300": "#c4b5fd",
    "--color-primary-400": "#a78bfa",
    "--color-primary-500": "#7c3aed",
    "--color-primary-600": "#6d28d9",
    "--color-primary-700": "#5b21b6",
    "--color-primary-800": "#4c1d95",
    "--color-primary-900": "#3b1474",
  },
  orange: {
    "--color-primary-50":  "#fff7ed",
    "--color-primary-100": "#ffedd5",
    "--color-primary-200": "#fed7aa",
    "--color-primary-300": "#fdba74",
    "--color-primary-400": "#fb923c",
    "--color-primary-500": "#ea580c",
    "--color-primary-600": "#c2410c",
    "--color-primary-700": "#9a3412",
    "--color-primary-800": "#7c2d12",
    "--color-primary-900": "#5e1f0a",
  },
  red: {
    "--color-primary-50":  "#fef2f2",
    "--color-primary-100": "#fee2e2",
    "--color-primary-200": "#fecaca",
    "--color-primary-300": "#fca5a5",
    "--color-primary-400": "#f87171",
    "--color-primary-500": "#dc2626",
    "--color-primary-600": "#b91c1c",
    "--color-primary-700": "#991b1b",
    "--color-primary-800": "#7f1d1d",
    "--color-primary-900": "#5e1515",
  },
};

/** Apply accent CSS variables and the --color-active tint to :root. */
function applyAccent(accentColor: string, isDark: boolean) {
  const root = document.documentElement;
  const palette = accentMap[accentColor] ?? accentMap.green;
  Object.entries(palette).forEach(([key, value]) =>
    root.style.setProperty(key, value)
  );
  // Active tint: 15% opacity in dark, 10% in light
  root.style.setProperty(
    "--color-active",
    isDark
      ? `${palette["--color-primary-500"]}26`
      : `${palette["--color-primary-500"]}1a`
  );
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, accentColor, fontSize, chatBackground } = useThemeStore();

  // ── Rehydrate theme store when the authenticated user changes ────────────
  // This ensures each user loads their own scoped preferences on
  // login / logout / account switch (key changes from ":userId" to ":anonymous").
  React.useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (state.user?.id !== prevState.user?.id) {
        useThemeStore.persist.rehydrate();
      }
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;

    // ── 1. Resolve system theme ──────────────────────────────────────────
    const isDark =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : theme === "dark";

    root.classList.toggle("dark",  isDark);
    root.classList.toggle("light", !isDark);
    // Enable smooth transitions globally on theme change
    root.classList.add("theme-transition");

    // ── 2. Font size ─────────────────────────────────────────────────────
    root.setAttribute("data-font-size", fontSize);

    // ── 3. Chat background ───────────────────────────────────────────────
    root.setAttribute("data-chat-bg", chatBackground);

    // ── 4. Accent palette + active tint ──────────────────────────────────
    applyAccent(accentColor, isDark);

    // ── 5. System theme change listener ──────────────────────────────────
    // Also recomputes --color-active so tint stays consistent with dark/light.
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle("dark",  e.matches);
        root.classList.toggle("light", !e.matches);
        // Recompute accent tint for new dark/light state
        applyAccent(accentColor, e.matches);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, accentColor, fontSize, chatBackground]);

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppInitializer>
        <RouterProvider router={router} />
      </AppInitializer>
    </ThemeProvider>
  </React.StrictMode>
);
