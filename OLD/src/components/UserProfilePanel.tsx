import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import type { ParticipantInfo } from "@/services/chatService";

const EXTENDED_PROFILES: Record<number, { email: string; department: string; title: string; phone: string }> = {
  2: { email: "alice.martin@acme.fr", department: "Développement", title: "Lead Developer", phone: "+33 6 12 34 56 78" },
  3: { email: "bob.dupont@acme.fr", department: "Commercial", title: "Responsable commercial", phone: "+33 6 98 76 54 32" },
  4: { email: "claire.bernard@acme.fr", department: "Finance", title: "Directrice Financière", phone: "+33 6 11 22 33 44" },
  5: { email: "david.moreau@acme.fr", department: "Développement", title: "Développeur Full-Stack", phone: "+33 6 55 66 77 88" },
};

const LAST_SEEN: Record<number, string> = {
  2: "Maintenant",
  3: "Il y a 1h",
  4: "Il y a 2h",
  5: "Il y a 30 min",
};

const presenceLabel: Record<string, string> = {
  online: "En ligne", away: "Absent", busy: "Occupé", offline: "Hors ligne",
};
const presenceColor: Record<string, string> = {
  online: "#22c55e", away: "#f59e0b", busy: "#ef4444", offline: "var(--color-text-muted)",
};

const mockMedia = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  color: `hsl(${(i * 60 + 200) % 360}, 50%, 60%)`,
}));
const mockDocs = [
  { name: "Rapport_Q3.pdf", size: "2.1 Mo", type: "pdf" },
  { name: "Projet_spec.docx", size: "340 Ko", type: "docx" },
];

interface Props {
  participant: ParticipantInfo;
  conversationId?: number;
  onClose: () => void;
  onSendMessage?: () => void;
}

export function UserProfilePanel({ participant, conversationId, onClose, onSendMessage }: Props) {
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [mediaTab, setMediaTab] = useState<"photos" | "docs">("photos");

  const isMe = participant.userId === currentUser?.id;
  const ext = EXTENDED_PROFILES[participant.userId];
  const lastSeen = LAST_SEEN[participant.userId];
  const hue = participant.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{ width: 320, backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: "var(--color-header-bg)", borderColor: "var(--color-border)" }}
      >
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0" style={{ color: "var(--color-text-muted)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
          {isMe ? "Mon profil" : "Profil"}
        </span>
        {isMe && (
          <button
            onClick={() => { onClose(); navigate("/profile"); }}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-primary-500)" }}
          >
            Modifier
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar & name */}
        <div
          className="flex flex-col items-center py-6 px-4"
          style={{ backgroundColor: "var(--color-header-bg)" }}
        >
          <div className="relative mb-3">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold"
              style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
            >
              {participant.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <span
              className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
              style={{ backgroundColor: presenceColor[participant.presenceStatus] ?? presenceColor.offline, borderColor: "var(--color-header-bg)" }}
            />
          </div>

          <h2 className="font-bold text-xl text-center" style={{ color: "var(--color-text-primary)" }}>
            {participant.displayName}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: presenceColor[participant.presenceStatus] }}>
            {presenceLabel[participant.presenceStatus] ?? "Hors ligne"}
          </p>
          {lastSeen && participant.presenceStatus !== "online" && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Vu {lastSeen}
            </p>
          )}

          {ext?.title && (
            <p className="text-sm mt-2 text-center font-medium" style={{ color: "var(--color-text-secondary)" }}>
              {ext.title}
            </p>
          )}

          {!isMe && onSendMessage && (
            <button
              onClick={onSendMessage}
              className="mt-4 flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Envoyer un message
            </button>
          )}
        </div>

        {/* Info fields */}
        <div className="py-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          {[
            { icon: "📧", label: "Email", value: ext?.email ?? `${participant.displayName.toLowerCase().replace(/ /g, ".")}@acme.fr` },
            { icon: "🏢", label: "Département", value: ext?.department ?? "—" },
            { icon: "💼", label: "Poste", value: ext?.title ?? "—" },
            { icon: "📞", label: "Téléphone", value: ext?.phone ?? "—" },
          ].map((f) => (
            <div key={f.label} className="flex items-start gap-3 px-4 py-3">
              <span className="text-lg shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{f.label}</p>
                <p className="text-sm mt-0.5" style={{ color: "var(--color-text-primary)" }}>{f.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Shared media */}
        <div className="border-t py-4 px-4" style={{ borderColor: "var(--color-border)" }}>
          <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>
            Médias partagés
          </h4>
          <div className="flex gap-2 mb-3">
            {(["photos", "docs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMediaTab(t)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: mediaTab === t ? "var(--color-primary-500)" : "var(--color-surface-secondary)",
                  color: mediaTab === t ? "#fff" : "var(--color-text-muted)",
                }}
              >
                {t === "photos" ? "Photos" : "Documents"}
              </button>
            ))}
          </div>

          {mediaTab === "photos" && (
            <div className="grid grid-cols-3 gap-1">
              {mockMedia.map((m) => (
                <div key={m.id} className="aspect-square rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: m.color }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              ))}
            </div>
          )}

          {mediaTab === "docs" && (
            <div className="space-y-2">
              {mockDocs.map((d) => (
                <div key={d.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: d.type === "pdf" ? "#ef4444" : "#2563eb" }}>
                    {d.type.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{d.name}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{d.size}</div>
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
        </div>
      </div>
    </div>
  );
}
