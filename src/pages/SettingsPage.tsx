import { useState } from "react";
import { useThemeStore, AccentColor, FontSize, ChatBackground } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";
import { useNavigate } from "react-router-dom";
import { useNotificationStore, NotifSoundType } from "@/store/notificationStore";
import { requestNotificationPermission, playNotificationSound, sendTestNotification } from "@/services/notificationService";
import { isTauri } from "@/services/chatService";

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

// ─── Notification settings sub-component ─────────────────────────────────────
const soundOptions: { id: NotifSoundType; label: string }[] = [
  { id: "message",  label: "Son doux" },
  { id: "priority", label: "Son urgent" },
  { id: "none",     label: "Silence" },
];

function NotificationSettings() {
  const {
    globalSound, dndEnabled, dndStartHour, dndEndHour,
    notifGranted,
    setGlobalSound, setDnd, setNotifGranted,
  } = useNotificationStore();
  const [requesting, setRequesting] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string>("");

  const handleRequestPerm = async () => {
    setRequesting(true);
    const ok = await requestNotificationPermission();
    setNotifGranted(ok);
    setRequesting(false);
  };

  const handleTest = async () => {
    setTestState("sending");
    setTestError("");
    const result = await sendTestNotification();
    if (result.success) {
      setTestState("ok");
      setTimeout(() => setTestState("idle"), 3000);
    } else {
      setTestState("error");
      setTestError(result.error ?? "Échec inconnu");
      setTimeout(() => setTestState("idle"), 5000);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase tracking-wider mb-4"
        style={{ color: "var(--color-text-muted)" }}
      >
        Notifications
      </h2>
      <div
        className="rounded-2xl overflow-hidden border divide-y"
        style={{
          backgroundColor: "var(--color-surface-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Permission */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              {isTauri() ? "Notifications Windows natives" : "Notifications navigateur"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {notifGranted ? "Activées ✓" : "Cliquez pour autoriser"}
            </p>
          </div>
          {notifGranted ? (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
              Actives
            </span>
          ) : (
            <button
              onClick={handleRequestPerm}
              disabled={requesting}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-opacity"
              style={{ backgroundColor: "var(--color-primary-500)", opacity: requesting ? 0.6 : 1 }}
            >
              {requesting ? "..." : "Autoriser"}
            </button>
          )}
        </div>

        {/* Bouton Test */}
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
              Tester les notifications
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: testState === "error" ? "#ef4444" : "var(--color-text-muted)" }}>
              {testState === "idle" && "Envoie une notification de test maintenant"}
              {testState === "sending" && "Envoi en cours…"}
              {testState === "ok" && "✓ Notification envoyée avec succès !"}
              {testState === "error" && `Erreur : ${testError}`}
            </p>
          </div>
          <button
            onClick={handleTest}
            disabled={testState === "sending"}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium border-2 transition-all"
            style={{
              borderColor: testState === "ok" ? "#16a34a" : testState === "error" ? "#ef4444" : "var(--color-primary-500)",
              color: testState === "ok" ? "#16a34a" : testState === "error" ? "#ef4444" : "var(--color-primary-500)",
              backgroundColor: "transparent",
              opacity: testState === "sending" ? 0.6 : 1,
            }}
          >
            {testState === "sending" ? "…" : testState === "ok" ? "✓ OK" : testState === "error" ? "✗ Échec" : "Tester"}
          </button>
        </div>

        {/* Son global */}
        <div className="px-4 py-3">
          <p className="text-sm font-medium mb-2" style={{ color: "var(--color-text-primary)" }}>Son de notification</p>
          <div className="flex gap-2">
            {soundOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setGlobalSound(opt.id);
                  if (opt.id !== "none") playNotificationSound(opt.id);
                }}
                className="flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all"
                style={{
                  backgroundColor: globalSound === opt.id ? "var(--color-primary-500)" : "var(--color-surface)",
                  color: globalSound === opt.id ? "white" : "var(--color-text-secondary)",
                  borderColor: globalSound === opt.id ? "var(--color-primary-500)" : "transparent",
                }}
              >
                {opt.id === "none" ? "🔇" : opt.id === "priority" ? "🔔" : "🔉"} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ne pas déranger */}
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Ne pas déranger</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Silencieux sauf messages prioritaires
              </p>
            </div>
            <button
              onClick={() => setDnd(!dndEnabled, dndStartHour, dndEndHour)}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{ backgroundColor: dndEnabled ? "var(--color-primary-500)" : "var(--color-border)" }}
            >
              <div
                className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-transform"
                style={{ transform: dndEnabled ? "translateX(21px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {dndEnabled && (
            <div
              className="flex items-center gap-2 text-sm p-3 rounded-xl"
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>De</span>
              <input
                type="number" min={0} max={23}
                value={pad(dndStartHour)}
                onChange={(e) => setDnd(dndEnabled, Number(e.target.value), dndEndHour)}
                className="w-14 text-center rounded-lg border px-2 py-1 text-sm font-mono"
                style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>h à</span>
              <input
                type="number" min={0} max={23}
                value={pad(dndEndHour)}
                onChange={(e) => setDnd(dndEnabled, dndStartHour, Number(e.target.value))}
                className="w-14 text-center rounded-lg border px-2 py-1 text-sm font-mono"
                style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>h</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SettingsPage() {
  const {
    theme, accentColor, fontSize, chatBackground,
    setTheme, setAccentColor, setFontSize, setChatBackground,
  } = useThemeStore();
  const { user, token, clearAuth } = useAuthStore();
  const navigate = useNavigate();

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
      <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
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

          {/* ── Notifications ───────────────────────────────────────────── */}
          <NotificationSettings />

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
