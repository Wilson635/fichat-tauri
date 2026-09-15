import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeStore, AccentColor, FontSize, ChatBackground } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";
import { useNotificationStore, NotifSoundType } from "@/store/notificationStore";
import { requestNotificationPermission, playNotificationSound, sendTestNotification } from "@/services/notificationService";
import { isTauri } from "@/services/chatService";
import { Icon, type IconName } from "@/components/Icon";
import { AppLogo } from "@/components/AppLogo";
import { APP_NAME } from "@/brand";

type SettingsSection = "appearance" | "notifications" | "account" | "about";

const accentColors: { id: AccentColor; label: string; hex: string }[] = [
  { id: "green", label: "Émeraude", hex: "#00a884" },
  { id: "blue", label: "Azure", hex: "#0078d4" },
  { id: "purple", label: "Violet", hex: "#7c3aed" },
  { id: "orange", label: "Orange", hex: "#ea580c" },
  { id: "red", label: "Rouge", hex: "#dc2626" },
];

const fontSizes: { id: FontSize; label: string; sample: string; px: number }[] = [
  { id: "small", label: "Compacte", sample: "Aa", px: 13 },
  { id: "medium", label: "Standard", sample: "Aa", px: 15 },
  { id: "large", label: "Grande", sample: "Aa", px: 17 },
];

const chatBackgrounds: { id: ChatBackground; label: string; hint: string }[] = [
  { id: "default", label: "Brume", hint: "Dégradé teal" },
  { id: "white", label: "Ivoire", hint: "Papier clair" },
  { id: "dark", label: "Nuit", hint: "Sombre produit" },
  { id: "pattern-dots", label: "Lin", hint: "Texture fine" },
  { id: "pattern-bubble", label: "Trame", hint: "Losanges" },
  { id: "slate", label: "Ardoise", hint: "Acier froid" },
  { id: "navy", label: "Marine", hint: "Navy et or" },
  { id: "sage", label: "Sauge", hint: "Vert calme" },
  { id: "graphite", label: "Graphite", hint: "Grain fin" },
  { id: "sand", label: "Sable", hint: "Pierre chaude" },
  { id: "frost", label: "Givre", hint: "Bleu glacier" },
  { id: "horizon", label: "Horizon", hint: "Crépuscule" },
  { id: "grid", label: "Plan", hint: "Quadrillage" },
  { id: "silk", label: "Soie", hint: "Satin diagonal" },
  { id: "ink", label: "Encre", hint: "Indigo" },
];

const NAV: { id: SettingsSection; label: string; hint: string; icon: IconName }[] = [
  { id: "appearance", label: "Apparence", hint: "Thème, couleurs, fond", icon: "palette" },
  { id: "notifications", label: "Notifications", hint: "Sons et alertes", icon: "bell" },
  { id: "account", label: "Compte", hint: "Session et profil", icon: "user" },
  { id: "about", label: "À propos", hint: `Présentation de ${APP_NAME}`, icon: "info" },
];

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="relative w-11 h-6 rounded-full transition-colors shrink-0"
      style={{ backgroundColor: on ? "var(--color-primary-500)" : "var(--color-border-strong)" }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
        style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="settings-card rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {children}
    </div>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3">
      {icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-secondary)" }}
        >
          <Icon name={icon} size={16} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </p>
        {description && (
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--color-text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function ChatPreview({ tall = false }: { tall?: boolean }) {
  const { fontSize } = useThemeStore();
  const isDark = document.documentElement.classList.contains("dark");
  const fontPx = fontSizes.find((f) => f.id === fontSize)?.px ?? 15;

  return (
    <div
      className={`rounded-xl overflow-hidden border ${tall ? "flex flex-col h-full min-h-0" : ""}`}
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ backgroundColor: "var(--color-header-bg)" }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold text-white"
          style={{ backgroundColor: "var(--color-primary-500)" }}
        >
          AD
        </div>
        <div className="min-w-0">
          <span className="block text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
            Aperçu
          </span>
          {tall && (
            <span className="block text-[11px]" style={{ color: "var(--color-text-muted)" }}>en ligne</span>
          )}
        </div>
      </div>
      <div className={`chat-bg px-3 py-3 space-y-2 ${tall ? "flex-1 min-h-0 overflow-y-auto" : ""}`} style={{ minHeight: tall ? undefined : 118 }}>
        <div className="flex justify-start">
          <div
            className="msg-copy msg-bubble"
            style={{
              backgroundColor: isDark ? "#1E2A31" : "#ffffff",
              fontSize: `${fontPx}px`,
              color: isDark ? "#e9edef" : "#111b21",
              borderRadius: "16px 16px 16px 4px",
              border: isDark ? "1px solid #2a3942" : "1px solid #e9edef",
              padding: "10px 12px 8px",
            }}
          >
            Bonjour
            <span className="msg-meta">
              <span className="text-[10px] tabular-nums" style={{ color: "#667781" }}>14:32</span>
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="msg-copy msg-bubble"
            style={{
              backgroundColor: isDark ? "#1C3A34" : "#E7F0EC",
              fontSize: `${fontPx}px`,
              color: isDark ? "#e9edef" : "#111b21",
              borderRadius: "16px 16px 4px 16px",
              padding: "10px 12px 8px",
            }}
          >
            hello
            <span className="msg-meta">
              <span className="text-[10px] tabular-nums" style={{ color: "#667781" }}>14:33</span>
            </span>
          </div>
        </div>
        {tall && (
          <>
            <div className="flex justify-start">
              <div
                className="msg-copy msg-bubble"
                style={{
                  backgroundColor: isDark ? "#1E2A31" : "#ffffff",
                  fontSize: `${fontPx}px`,
                  color: isDark ? "#e9edef" : "#111b21",
                  borderRadius: "16px 16px 16px 4px",
                  border: isDark ? "1px solid #2a3942" : "1px solid #e9edef",
                  padding: "10px 12px 8px",
                }}
              >
                Le fond et la taille s’appliquent ici.
                <span className="msg-meta">
                  <span className="text-[10px] tabular-nums" style={{ color: "#667781" }}>14:34</span>
                </span>
              </div>
            </div>
            <div className="flex justify-end">
              <div
                className="msg-copy msg-bubble"
                style={{
                  backgroundColor: isDark ? "#1C3A34" : "#E7F0EC",
                  fontSize: `${fontPx}px`,
                  color: isDark ? "#e9edef" : "#111b21",
                  borderRadius: "16px 16px 4px 16px",
                  padding: "10px 12px 8px",
                }}
              >
                Parfait, merci.
                <span className="msg-meta">
                  <span className="text-[10px] tabular-nums" style={{ color: "#667781" }}>14:34</span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      {tall && (
        <div className="shrink-0 px-3 py-2.5 flex items-center gap-2" style={{ borderTop: "1px solid var(--color-border)", backgroundColor: "var(--color-header-bg)" }}>
          <div className="flex-1 h-9 rounded-xl px-3 flex items-center text-[12px]" style={{ backgroundColor: "var(--color-input-bg)", color: "var(--color-text-muted)" }}>
            Message…
          </div>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-primary-500)" }}>
            <Icon name="send" size={14} style={{ color: "#fff" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AppearanceSection() {
  const {
    theme, accentColor, fontSize, chatBackground,
    setTheme, setAccentColor, setFontSize, setChatBackground,
  } = useThemeStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Apparence
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
          Personnalisez l’interface de {APP_NAME} sur cet appareil.
        </p>
      </div>

      <SettingsCard>
        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
            Thème
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "light" as const, label: "Clair", icon: "sun" as IconName },
              { id: "dark" as const, label: "Sombre", icon: "moonStar" as IconName },
              { id: "system" as const, label: "Système", icon: "laptop" as IconName },
            ]).map((t) => {
              const on = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className="flex flex-col items-center gap-2 py-3 rounded-xl border transition-all"
                  style={{
                    backgroundColor: on ? "var(--color-active)" : "var(--color-surface-secondary)",
                    borderColor: on ? "var(--color-primary-500)" : "transparent",
                    color: on ? "var(--color-primary-700)" : "var(--color-text-secondary)",
                  }}
                >
                  <Icon name={t.icon} size={18} />
                  <span className="text-[12px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
            Couleur d’accent
          </p>
          <div className="flex gap-3 flex-wrap">
            {accentColors.map((c) => {
              const on = accentColor === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setAccentColor(c.id)} className="flex flex-col items-center gap-1.5" title={c.label}>
                  <span
                    className="w-9 h-9 rounded-full"
                    style={{
                      backgroundColor: c.hex,
                      boxShadow: on ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c.hex}` : "none",
                    }}
                  />
                  <span className="text-[11px] font-medium" style={{ color: on ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
            Taille du texte
          </p>
          <div className="grid grid-cols-3 gap-2">
            {fontSizes.map((s) => {
              const on = fontSize === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFontSize(s.id)}
                  className="py-2.5 rounded-xl border font-semibold transition-all"
                  style={{
                    backgroundColor: on ? "var(--color-active)" : "var(--color-surface-secondary)",
                    borderColor: on ? "var(--color-primary-500)" : "transparent",
                    color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontSize: `${s.px}px`,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
            Fond de conversation
          </p>
          <p className="text-[12px] mb-4" style={{ color: "var(--color-text-muted)" }}>
            Appliqué à la zone de messages.
          </p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {chatBackgrounds.map((bg) => {
              const on = chatBackground === bg.id;
              return (
                <button key={bg.id} type="button" onClick={() => setChatBackground(bg.id)} className="flex flex-col items-center gap-1.5 min-w-0" title={bg.hint}>
                  <div
                    className="chat-bg w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center"
                    data-chat-bg={bg.id}
                    style={{
                      boxShadow: on ? "0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-primary-500)" : "inset 0 0 0 1px var(--color-border)",
                    }}
                  >
                    {on && (
                      <Icon
                        name="checkBadge"
                        size={16}
                        style={{ color: "var(--color-primary-500)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-medium truncate w-full text-center" style={{ color: on ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    {bg.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="settings-inline-preview">
            <ChatPreview />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

function NotificationsSection() {
  const {
    globalSound, dndEnabled, dndStartHour, dndEndHour,
    notifGranted, setGlobalSound, setDnd, setNotifGranted,
  } = useNotificationStore();
  const [requesting, setRequesting] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    authService.getAutostart().then(setAutostart).catch(() => {});
  }, []);

  const soundOptions: { id: NotifSoundType; label: string; icon: IconName }[] = [
    { id: "message", label: "Doux", icon: "message" },
    { id: "priority", label: "Urgent", icon: "bell" },
    { id: "none", label: "Silence", icon: "moon" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Notifications
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
          Contrôlez les alertes, les sons et les plages silencieuses.
        </p>
      </div>

      <SettingsCard>
        <SettingsRow
          icon="bell"
          title={isTauri() ? "Notifications Windows" : "Notifications du navigateur"}
          description={notifGranted ? "Autorisées sur cet appareil" : `${APP_NAME} a besoin de l’autorisation système`}
        >
          {notifGranted ? (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: "rgba(22,163,74,0.12)", color: "#16a34a" }}>
              Actives
            </span>
          ) : (
            <button
              type="button"
              disabled={requesting}
              onClick={async () => {
                setRequesting(true);
                setNotifGranted(await requestNotificationPermission());
                setRequesting(false);
              }}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {requesting ? "…" : "Autoriser"}
            </button>
          )}
        </SettingsRow>

        <SettingsRow
          icon="alert"
          title="Tester une notification"
          description={
            globalSound === "priority"
              ? "Alerte bloquante plein écran"
              : globalSound === "none"
                ? "Toast Windows, sans son"
                : "Toast Windows, comme une notification système"
          }
        >
          <button
            type="button"
            disabled={testState === "sending"}
            onClick={async () => {
              setTestState("sending");
              setTestError("");
              const result = await sendTestNotification(globalSound);
              if (result.success) {
                setTestState("ok");
                setTimeout(() => setTestState("idle"), 2500);
              } else {
                setTestError(result.error ?? "Échec");
                setTestState("error");
                setTimeout(() => setTestState("idle"), 4000);
              }
            }}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
            style={{
              borderColor: testState === "ok" ? "#16a34a" : testState === "error" ? "#ef4444" : "var(--color-border)",
              color: testState === "ok" ? "#16a34a" : testState === "error" ? "#ef4444" : "var(--color-text-primary)",
            }}
          >
            {testState === "sending" ? "…" : testState === "ok" ? "OK" : testState === "error" ? testError : "Tester"}
          </button>
        </SettingsRow>
      </SettingsCard>

      {isTauri() && (
        <SettingsCard>
          <SettingsRow
            icon="laptop"
            title="Arrière-plan"
            description={`Fermer la fenêtre laisse ${APP_NAME} dans la barre d’état : les messages continuent d’arriver.`}
          />
          <SettingsRow
            icon="bell"
            title="Lancer avec Windows"
            description={`Démarrer ${APP_NAME} en arrière-plan à l’ouverture de session, pour ne manquer aucune alerte.`}
          >
            <Toggle
              on={autostart}
              label="Lancer avec Windows"
              onChange={async () => {
                if (autostartBusy) return;
                setAutostartBusy(true);
                try {
                  setAutostart(await authService.setAutostart(!autostart));
                } catch {
                  setAutostart(await authService.getAutostart());
                } finally {
                  setAutostartBusy(false);
                }
              }}
            />
          </SettingsRow>
        </SettingsCard>
      )}

      <SettingsCard>
        <div className="px-4 py-4">
          <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
            Mode de notification
          </p>
          <p className="text-[12px] mb-3" style={{ color: "var(--color-text-muted)" }}>
            Doux et Silence : toast Windows. Urgent : alerte bloquante.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {soundOptions.map((opt) => {
              const on = globalSound === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setGlobalSound(opt.id);
                    if (opt.id !== "none") playNotificationSound(opt.id);
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-semibold"
                  style={{
                    backgroundColor: on ? "var(--color-active)" : "var(--color-surface-secondary)",
                    borderColor: on ? "var(--color-primary-500)" : "transparent",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <Icon name={opt.icon} size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsRow icon="moon" title="Ne pas déranger" description="Coupe les sons hors messages prioritaires">
          <Toggle on={dndEnabled} label="Ne pas déranger" onChange={() => setDnd(!dndEnabled, dndStartHour, dndEndHour)} />
        </SettingsRow>
        {dndEnabled && (
          <div className="px-4 py-4 flex items-center gap-3">
            <label className="flex-1">
              <span className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Début
              </span>
              <select
                value={dndStartHour}
                onChange={(e) => setDnd(true, Number(e.target.value), dndEndHour)}
                className="w-full h-10 px-3 rounded-xl text-[13px] outline-none border"
                style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Fin
              </span>
              <select
                value={dndEndHour}
                onChange={(e) => setDnd(true, dndStartHour, Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl text-[13px] outline-none border"
                style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function AccountSection({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const initials = user?.displayName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Compte
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
          Identité de session et déconnexion.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/profile")}
        className="w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-colors"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-semibold text-white shrink-0 overflow-hidden"
          style={{ backgroundColor: "var(--color-primary-500)" }}
        >
          {user?.avatarPath ? <img src={user.avatarPath} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {user?.displayName}
          </p>
          <p className="text-[12px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {user?.email || `@${user?.username}`}
          </p>
        </div>
        <span className="text-[12px] font-semibold flex items-center gap-1" style={{ color: "var(--color-primary-600)" }}>
          Profil
          <Icon name="chevronRight" size={14} />
        </span>
      </button>

      <SettingsCard>
        <SettingsRow icon="user" title="Identifiant" description={user?.username ?? "—"} />
        <SettingsRow
          icon="shield"
          title="Rôle"
          description={user?.role === "system_admin" ? "Administrateur système" : "Utilisateur"}
        />
        <SettingsRow icon="lock" title="Authentification" description="Session Active Directory (LDAP)" />
      </SettingsCard>

      <SettingsCard>
        <button type="button" onClick={onLogout} className="w-full">
          <SettingsRow icon="logOut" title="Se déconnecter" description="Termine la session sur cet appareil">
            <Icon name="chevronRight" size={16} style={{ color: "#dc2626" }} />
          </SettingsRow>
        </button>
      </SettingsCard>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          À propos
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
          Présentation de {APP_NAME} et informations techniques.
        </p>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-2xl border" style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <AppLogo size={48} />
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{APP_NAME}</p>
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Messagerie interne First Trust · version 1.0.0</p>
        </div>
      </div>

      <div className="rounded-2xl border p-5" style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
          Qu’est-ce que {APP_NAME} ?
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {APP_NAME} est l’application de messagerie interne de First Trust. Elle permet aux collaborateurs
          d’échanger en temps réel, en discussions privées ou en groupes, depuis une application de bureau Windows
          connectée à l’annuaire d’entreprise.
        </p>
        <p className="text-[13px] leading-relaxed mt-3" style={{ color: "var(--color-text-secondary)" }}>
          L’authentification passe par Active Directory (LDAP) : aucun compte séparé n’est créé.
          Les messages, fichiers et notes vocales sont stockés côté serveur. Les alertes prioritaires
          peuvent interrompre le travail lorsqu’un message l’exige, et les administrateurs disposent
          d’une console pour suivre l’activité, synchroniser l’annuaire et consulter le journal de l’application.
        </p>
        <ul className="mt-4 space-y-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {[
            "Discussions directes et groupes d’équipe",
            "Partage de documents, images et messages vocaux",
            "Notifications natives, mode Ne pas déranger et alertes bloquantes",
            "Profil, présence et préférences d’apparence par utilisateur",
            "Administration : utilisateurs, sync LDAP et logs runtime exportables",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <Icon name="checkBadge" size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary-500)" }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <SettingsCard>
        <SettingsRow icon="lock" title="Authentification" description="LDAP / Active Directory — identifiants du domaine" />
        <SettingsRow icon="laptop" title="Application de bureau Windows" description={isTauri() ? `${APP_NAME} 1.0.0` : "Aperçu web"} />
        <SettingsRow icon="info" title="Éditeur" description="First Trust" />
      </SettingsCard>
    </div>
  );
}

function SettingsAside({ section }: { section: SettingsSection }) {
  const { theme, accentColor, fontSize, chatBackground } = useThemeStore();
  const { globalSound, dndEnabled, dndStartHour, dndEndHour, notifGranted } = useNotificationStore();
  const { user } = useAuthStore();

  const accent = accentColors.find((c) => c.id === accentColor);
  const bg = chatBackgrounds.find((b) => b.id === chatBackground);
  const themeLabel = theme === "light" ? "Clair" : theme === "dark" ? "Sombre" : "Système";
  const fontLabel = fontSizes.find((f) => f.id === fontSize)?.label ?? "Standard";
  const soundLabel = globalSound === "none" ? "Silence" : globalSound === "priority" ? "Urgent" : "Doux";
  const initials = user?.displayName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  if (section === "appearance") {
    return (
      <div className="settings-aside-card">
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Aperçu live</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {themeLabel} · {accent?.label} · {fontLabel} · {bg?.label}
          </p>
        </div>
        <div className="flex-1 min-h-0 p-3">
          <ChatPreview tall />
        </div>
      </div>
    );
  }

  if (section === "notifications") {
    return (
      <div className="settings-aside-card p-5 gap-4">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>État actuel</p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>Récapitulatif des alertes sur cet appareil.</p>
        </div>
        <div className="space-y-3">
          {[
            { icon: "bell" as IconName, title: "Permission", value: notifGranted ? "Accordée" : "Non accordée" },
            { icon: "message" as IconName, title: "Son", value: soundLabel },
            {
              icon: "moon" as IconName,
              title: "Ne pas déranger",
              value: dndEnabled
                ? `${String(dndStartHour).padStart(2, "0")}h – ${String(dndEndHour).padStart(2, "0")}h`
                : "Désactivé",
            },
          ].map((row) => (
            <div key={row.title} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}>
                <Icon name={row.icon} size={16} />
              </div>
              <div>
                <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{row.title}</p>
                <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{row.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === "account") {
    return (
      <div className="settings-aside-card items-center justify-center p-8 text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-semibold text-white overflow-hidden mb-4"
          style={{ backgroundColor: "var(--color-primary-500)" }}
        >
          {user?.avatarPath ? <img src={user.avatarPath} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
        <p className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{user?.displayName}</p>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{user?.email || `@${user?.username}`}</p>
        <p className="text-[12px] mt-3 px-2.5 py-1 rounded-md inline-block" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-secondary)" }}>
          {user?.role === "system_admin" ? "Administrateur système" : "Utilisateur"}
        </p>
      </div>
    );
  }

  return (
    <div className="settings-aside-card p-6 overflow-y-auto">
      <div className="mb-4">
        <AppLogo size={48} />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{APP_NAME}</p>
      <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>Version 1.0.0 · First Trust</p>
      <p className="text-[13px] leading-relaxed mt-4" style={{ color: "var(--color-text-secondary)" }}>
        Messagerie interne sécurisée pour les équipes First Trust : échanges privés et de groupe,
        fichiers et vocaux, alertes prioritaires, le tout authentifié via l’Active Directory.
      </p>
      <p className="text-[12px] mt-4" style={{ color: "var(--color-text-muted)" }}>
        {isTauri() ? "Application de bureau Windows" : "Aperçu web"}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("appearance");
  const { token, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (token) await authService.logout(token);
    clearAuth();
    window.location.href = "/login";
  };

  return (
    <div className="settings-page flex flex-col h-full" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
      <div
        className="flex items-center gap-2 px-5 shrink-0"
        style={{ height: 60, backgroundColor: "var(--color-header-bg)", borderBottom: "1px solid var(--color-border)" }}
      >
        <button type="button" onClick={() => navigate(-1)} className="icon-btn shrink-0">
          <Icon name="chevronLeft" size={20} />
        </button>
        <h1 className="text-[16px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Paramètres
        </h1>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex">
        <nav
          className="shrink-0 py-4 px-3 overflow-y-auto"
          style={{ width: 232, borderRight: "1px solid var(--color-border)", backgroundColor: "var(--color-sidebar-bg)" }}
        >
          {NAV.map((item) => {
            const on = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left mb-0.5"
                style={{
                  backgroundColor: on ? "var(--color-active)" : "transparent",
                  color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
              >
                <Icon name={item.icon} size={16} style={{ color: on ? "var(--color-primary-600)" : "var(--color-text-muted)" }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{item.label}</span>
                  <span className="block text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-stage">
          <div className="settings-form">
            <div className="settings-form-inner">
              {section === "appearance" && <AppearanceSection />}
              {section === "notifications" && <NotificationsSection />}
              {section === "account" && <AccountSection onLogout={handleLogout} />}
              {section === "about" && <AboutSection />}
            </div>
          </div>
          <aside className="settings-aside">
            <SettingsAside section={section} />
          </aside>
        </div>
      </div>
    </div>
  );
}
