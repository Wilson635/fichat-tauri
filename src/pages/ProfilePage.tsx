import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";

const PRESENCE_OPTIONS = [
  { value: "online", label: "En ligne", color: "#22c55e" },
  { value: "away", label: "Absent", color: "#f59e0b" },
  { value: "busy", label: "Occupé (Ne pas déranger)", color: "#ef4444" },
  { value: "offline", label: "Hors ligne", color: "var(--color-text-muted)" },
] as const;

const mockMedia = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  color: `hsl(${(i * 30 + 160) % 360}, 50%, 55%)`,
}));
const mockDocs = [
  { name: "Présentation_Q4.pptx", size: "5.2 Mo", type: "pptx", sharedWith: "Équipe Dev", date: "Hier" },
  { name: "Notes_réunion.docx", size: "156 Ko", type: "docx", sharedWith: "Direction ACME", date: "Il y a 2 jours" },
  { name: "Budget_2026.xlsx", size: "1.1 Mo", type: "xlsx", sharedWith: "Alice Martin", date: "Il y a 3 jours" },
];

export function ProfilePage() {
  const { user, updatePresence, updateProfile } = useAuthStore();
  const { dndEnabled, dndStartHour, dndEndHour, setDnd } = useNotificationStore();
  const navigate = useNavigate();

  const [statusMessage, setStatusMessage] = useState(user?.statusMessage ?? "");
  const [editingStatus, setEditingStatus] = useState(false);
  const [mediaTab, setMediaTab] = useState<"photos" | "docs" | "links">("photos");
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const hue = user.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  //const presenceOption = PRESENCE_OPTIONS.find((p) => p.value === user.presenceStatus) ?? PRESENCE_OPTIONS[0];

  const saveStatus = () => {
    updateProfile({ statusMessage });
    setEditingStatus(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ backgroundColor: "var(--color-surface)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0 sticky top-0 z-10"
        style={{ backgroundColor: "var(--color-header-bg)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>Mon profil</h1>
        {saved && (
          <span className="ml-auto text-xs text-green-500 font-medium">✓ Enregistré</span>
        )}
      </div>

      {/* Avatar section */}
      <div
        className="flex flex-col items-center py-8 px-4"
        style={{ backgroundColor: "var(--color-header-bg)" }}
      >
        <div className="relative group mb-4">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-bold"
            style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
          >
            {user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <button
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            title="Changer la photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {user.displayName}
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          @{user.username}
        </p>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Presence */}
        <section className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Statut de présence</h3>
          </div>
          <div className="p-4 space-y-2" style={{ backgroundColor: "var(--color-surface)" }}>
            {PRESENCE_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => updatePresence(p.value)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left"
                style={{ backgroundColor: user.presenceStatus === p.value ? "var(--color-active)" : "transparent" }}
                onMouseEnter={(e) => { if (user.presenceStatus !== p.value) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
                onMouseLeave={(e) => { if (user.presenceStatus !== p.value) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{p.label}</span>
                {user.presenceStatus === p.value && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-primary-500)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Status message */}
        <section className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Message de statut</h3>
            <button onClick={() => setEditingStatus((v) => !v)} className="text-xs" style={{ color: "var(--color-primary-500)" }}>
              {editingStatus ? "Annuler" : "Modifier"}
            </button>
          </div>
          <div className="p-4" style={{ backgroundColor: "var(--color-surface)" }}>
            {editingStatus ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  maxLength={140}
                  placeholder="Disponible pour toute question…"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border"
                  style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveStatus(); }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{statusMessage.length}/140</span>
                  <button onClick={saveStatus} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "var(--color-primary-500)" }}>
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm italic" style={{ color: statusMessage ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}>
                {statusMessage || "Aucun message de statut"}
              </p>
            )}
          </div>
        </section>

        {/* Profile info */}
        <section className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Informations</h3>
          </div>
          <div className="divide-y" style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            {[
              { icon: "📧", label: "Email", value: user.email ?? `${user.username}@acme.fr` },
              { icon: "🏢", label: "Département", value: user.department ?? "Non renseigné" },
              { icon: "💼", label: "Poste", value: user.title ?? "Non renseigné" },
              { icon: "📞", label: "Téléphone", value: user.phone ?? "Non renseigné" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-lg shrink-0">{f.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{f.label}</p>
                  <p className="text-sm mt-0.5 truncate" style={{ color: "var(--color-text-primary)" }}>{f.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Notification preferences */}
        <section className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Ne pas déranger</h3>
          </div>
          <div className="p-4 space-y-4" style={{ backgroundColor: "var(--color-surface)" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Mode Ne pas déranger</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Silencieux sauf messages prioritaires
                </p>
              </div>
              <div
                onClick={() => setDnd(!dndEnabled)}
                className="w-11 h-6 rounded-full relative cursor-pointer transition-colors"
                style={{ backgroundColor: dndEnabled ? "var(--color-primary-500)" : "var(--color-border)" }}
              >
                <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 shadow-sm transition-transform" style={{ transform: dndEnabled ? "translateX(22px)" : "translateX(2px)" }} />
              </div>
            </div>

            {dndEnabled && (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>De</p>
                  <select
                    value={dndStartHour}
                    onChange={(e) => setDnd(dndEnabled, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>À</p>
                  <select
                    value={dndEndHour}
                    onChange={(e) => setDnd(dndEnabled, undefined, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Shared media */}
        <section className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-4 py-3 border-b" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Médias partagés</h3>
          </div>
          <div className="p-4" style={{ backgroundColor: "var(--color-surface)" }}>
            <div className="flex gap-2 mb-4">
              {(["photos", "docs", "links"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMediaTab(t)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: mediaTab === t ? "var(--color-primary-500)" : "var(--color-surface-secondary)",
                    color: mediaTab === t ? "#fff" : "var(--color-text-muted)",
                  }}
                >
                  {t === "photos" ? "Photos" : t === "docs" ? "Documents" : "Liens"}
                </button>
              ))}
            </div>

            {mediaTab === "photos" && (
              <div className="grid grid-cols-4 gap-1.5">
                {mockMedia.map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: m.color }} />
                ))}
              </div>
            )}

            {mediaTab === "docs" && (
              <div className="space-y-2">
                {mockDocs.map((d) => (
                  <div key={d.name} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: d.type === "pdf" ? "#ef4444" : d.type === "xlsx" ? "#16a34a" : d.type === "pptx" ? "#ea580c" : "#2563eb" }}>
                      {d.type.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{d.name}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{d.size} · {d.sharedWith} · {d.date}</p>
                    </div>
                    <button style={{ color: "var(--color-primary-500)" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {mediaTab === "links" && (
              <div className="space-y-2">
                {[
                  { url: "https://acme.intranet.fr/projets", title: "Projets Intranet ACME", domain: "acme.intranet.fr", color: "#3b82f6" },
                  { url: "https://docs.acme.fr/wiki", title: "Wiki de l'entreprise", domain: "docs.acme.fr", color: "#8b5cf6" },
                  { url: "https://jira.acme.fr/board", title: "Board Jira — Sprint 14", domain: "jira.acme.fr", color: "#06b6d4" },
                ].map((l) => (
                  <div key={l.url} className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: l.color }}>
                      {l.domain[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{l.title}</p>
                      <p className="text-xs truncate" style={{ color: "var(--color-primary-500)" }}>{l.url}</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
