import { useThemeStore, AccentColor, FontSize, ChatBackground } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";

const accentColors: { id: AccentColor; label: string; hex: string }[] = [
  { id: "green",  label: "WhatsApp",  hex: "#00a884" },
  { id: "blue",   label: "Azure",     hex: "#0078d4" },
  { id: "purple", label: "Violet",    hex: "#7c3aed" },
  { id: "orange", label: "Orange",    hex: "#ea580c" },
  { id: "red",    label: "Rouge",     hex: "#dc2626" },
];

const fontSizes: { id: FontSize; label: string; px: number }[] = [
  { id: "small",  label: "Petit",  px: 13 },
  { id: "medium", label: "Moyen",  px: 15 },
  { id: "large",  label: "Grand",  px: 17 },
];

const chatBackgrounds: {
  id: ChatBackground;
  label: string;
  lightBg: string;
  darkBg: string;
  pattern?: string;
}[] = [
  {
    id: "default",
    label: "WhatsApp",
    lightBg: "#efeae2",
    darkBg: "#0b141a",
  },
  {
    id: "white",
    label: "Blanc",
    lightBg: "#ffffff",
    darkBg: "#1e1e2e",
  },
  {
    id: "dark",
    label: "Sombre",
    lightBg: "#2a2a3a",
    darkBg: "#050a0e",
  },
  {
    id: "pattern-dots",
    label: "Points",
    lightBg: "#efeae2",
    darkBg: "#0b141a",
    pattern: "radial-gradient(circle, rgba(0,0,0,0.15) 1px, transparent 1px)",
  },
  {
    id: "pattern-bubble",
    label: "Bulles",
    lightBg: "#e5ddd5",
    darkBg: "#0b141a",
    pattern:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='15' cy='15' r='6' fill='none' stroke='rgba(0,0,0,0.12)' stroke-width='1.5'/%3E%3Ccircle cx='45' cy='35' r='4' fill='none' stroke='rgba(0,0,0,0.1)' stroke-width='1.5'/%3E%3Crect x='8' y='32' width='14' height='8' rx='4' fill='none' stroke='rgba(0,0,0,0.09)' stroke-width='1.5'/%3E%3Crect x='38' y='10' width='14' height='8' rx='4' fill='none' stroke='rgba(0,0,0,0.08)' stroke-width='1.5'/%3E%3C/svg%3E\")",
  },
];

// ─── Mini chat preview component ─────────────────────────────────────────────
function ChatPreview() {
  const { chatBackground, accentColor, fontSize } = useThemeStore();
  const bg = chatBackgrounds.find((b) => b.id === chatBackground) ?? chatBackgrounds[0];

  const isDark = document.documentElement.classList.contains("dark");
  const bgColor = isDark ? bg.darkBg : bg.lightBg;

  const accentHex = accentColors.find((c) => c.id === accentColor)?.hex ?? "#00a884";
  const fontPx = fontSizes.find((f) => f.id === fontSize)?.px ?? 15;

  const previewStyle: React.CSSProperties = {
    backgroundColor: bgColor,
    backgroundImage: bg.pattern,
    backgroundSize: bg.pattern ? "20px 20px" : undefined,
  };

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Fake header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: "var(--color-header-bg)" }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: accentHex }}
        >
          AD
        </div>
        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          Alice Dupont
        </span>
      </div>

      {/* Chat area */}
      <div className="px-3 py-3 space-y-2" style={{ ...previewStyle, minHeight: 110 }}>
        {/* Incoming bubble */}
        <div className="flex justify-start">
          <div
            className="rounded-xl rounded-tl-sm px-3 py-1.5 max-w-[70%] shadow-sm"
            style={{
              backgroundColor: isDark ? "#202c33" : "#ffffff",
              fontSize: `${fontPx}px`,
              color: isDark ? "#e9edef" : "#111b21",
            }}
          >
            <span>Bonjour ! 👋</span>
            <span className="block text-right text-[10px] mt-0.5" style={{ color: "#667781" }}>14:32</span>
          </div>
        </div>

        {/* Outgoing bubble */}
        <div className="flex justify-end">
          <div
            className="rounded-xl rounded-tr-sm px-3 py-1.5 max-w-[70%] shadow-sm"
            style={{
              backgroundColor: isDark ? accentHex + "cc" : accentHex + "33",
              fontSize: `${fontPx}px`,
              color: isDark ? "#e9edef" : "#111b21",
            }}
          >
            <span>Salut ! Ça va ?</span>
            <span className="block text-right text-[10px] mt-0.5" style={{ color: "#667781" }}>14:33 ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SettingsPage() {
  const {
    theme, accentColor, fontSize, chatBackground,
    setTheme, setAccentColor, setFontSize, setChatBackground,
  } = useThemeStore();
  const { user, token, clearAuth } = useAuthStore();

  const isDark = document.documentElement.classList.contains("dark");

  const handleLogout = async () => {
    if (token) {
      await authService.logout(token);
    }
    clearAuth();
    window.location.href = "/login";
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Paramètres
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-8 max-w-2xl">

          {/* ── Profil ──────────────────────────────────────────────────── */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Mon profil
            </h2>
            <div
              className="flex items-center gap-4 p-4 rounded-xl"
              style={{ backgroundColor: "var(--color-surface-secondary)" }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                style={{ backgroundColor: "var(--color-primary-500)" }}
              >
                {user?.displayName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
              </div>
              <div>
                <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {user?.displayName}
                </div>
                <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {user?.email}
                </div>
                {(user?.department || user?.title) && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {[user.department, user.title].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Apparence ───────────────────────────────────────────────── */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{ color: "var(--color-text-muted)" }}
            >
              Apparence
            </h2>
            <div className="space-y-6">

              {/* Thème */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Thème
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className="py-2.5 rounded-xl text-sm font-medium border-2 transition-all"
                      style={{
                        backgroundColor:
                          theme === t
                            ? "var(--color-primary-500)"
                            : "var(--color-surface-secondary)",
                        color: theme === t ? "white" : "var(--color-text-secondary)",
                        borderColor:
                          theme === t ? "var(--color-primary-500)" : "transparent",
                      }}
                    >
                      {t === "light" ? "☀️ Clair" : t === "dark" ? "🌙 Sombre" : "🖥 Système"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Couleur d'accent */}
              <div>
                <label
                  className="block text-sm font-medium mb-3"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Couleur d'accent
                </label>
                <div className="flex gap-4 flex-wrap">
                  {accentColors.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setAccentColor(c.id)}
                      className="flex flex-col items-center gap-1.5 group"
                      title={c.label}
                    >
                      <div
                        className="w-10 h-10 rounded-full transition-all duration-200"
                        style={{
                          backgroundColor: c.hex,
                          transform: accentColor === c.id ? "scale(1.2)" : "scale(1)",
                          boxShadow:
                            accentColor === c.id
                              ? `0 0 0 2.5px var(--color-surface), 0 0 0 4.5px ${c.hex}`
                              : "none",
                        }}
                      />
                      <span
                        className="text-xs transition-colors"
                        style={{
                          color:
                            accentColor === c.id
                              ? "var(--color-text-primary)"
                              : "var(--color-text-muted)",
                          fontWeight: accentColor === c.id ? 600 : 400,
                        }}
                      >
                        {c.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Taille de police */}
              <div>
                <label
                  className="block text-sm font-medium mb-3"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Taille de police
                </label>
                <div className="flex gap-2">
                  {fontSizes.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setFontSize(s.id)}
                      className="flex-1 py-2.5 rounded-xl border-2 font-medium transition-all"
                      style={{
                        backgroundColor:
                          fontSize === s.id
                            ? "var(--color-primary-500)"
                            : "var(--color-surface-secondary)",
                        color: fontSize === s.id ? "white" : "var(--color-text-secondary)",
                        borderColor:
                          fontSize === s.id ? "var(--color-primary-500)" : "transparent",
                        fontSize: `${s.px}px`,
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Fond de conversation ─────────────────────────────────────── */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{ color: "var(--color-text-muted)" }}
            >
              Fond de conversation
            </h2>

            {/* Swatches grid */}
            <div className="grid grid-cols-5 gap-3 mb-5">
              {chatBackgrounds.map((bg) => {
                const bgColor = isDark ? bg.darkBg : bg.lightBg;
                const isSelected = chatBackground === bg.id;
                return (
                  <button
                    key={bg.id}
                    onClick={() => setChatBackground(bg.id)}
                    className="flex flex-col items-center gap-1.5"
                    title={bg.label}
                  >
                    {/* Swatch */}
                    <div
                      className="w-full aspect-square rounded-xl transition-all overflow-hidden"
                      style={{
                        backgroundColor: bgColor,
                        backgroundImage: bg.pattern,
                        backgroundSize: bg.pattern ? "20px 20px" : undefined,
                        boxShadow: isSelected
                          ? `0 0 0 2.5px var(--color-surface), 0 0 0 4.5px var(--color-primary-500)`
                          : "0 1px 3px rgba(0,0,0,0.1)",
                        transform: isSelected ? "scale(1.05)" : "scale(1)",
                      }}
                    >
                      {isSelected && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                            style={{ color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.6)" }}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span
                      className="text-xs text-center leading-tight"
                      style={{
                        color: isSelected
                          ? "var(--color-text-primary)"
                          : "var(--color-text-muted)",
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {bg.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div>
              <p
                className="text-xs mb-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                Aperçu en temps réel
              </p>
              <ChatPreview />
            </div>
          </section>

          {/* ── Compte ──────────────────────────────────────────────────── */}
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Compte
            </h2>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                color: "#dc2626",
                backgroundColor: "rgba(220,38,38,0.06)",
                border: "1px solid rgba(220,38,38,0.2)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Se déconnecter
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
