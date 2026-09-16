import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore, type UserProfile } from "@/store/authStore";
import { Icon, type IconName } from "@/components/Icon";
import { authService } from "@/services/authService";
import { prepareProfileAvatar } from "@/utils/fileUtils";
import { useToastStore } from "@/store/toastStore";

const PRESENCE_OPTIONS: {
  value: UserProfile["presenceStatus"];
  label: string;
  hint: string;
  color: string;
}[] = [
  { value: "online", label: "En ligne", hint: "Visible et disponible", color: "#22c55e" },
  { value: "away", label: "Absent", hint: "Pas à votre poste", color: "#f59e0b" },
  { value: "busy", label: "Occupé", hint: "Ne pas déranger", color: "#ef4444" },
  { value: "offline", label: "Hors ligne", hint: "Apparaître déconnecté", color: "#94a3b8" },
];

function initialsOf(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function hueOf(name: string) {
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function InfoRow({
  icon,
  label,
  value,
  copyable,
}: {
  icon: IconName;
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const empty = !value || value === "Non renseigné";

  return (
    <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: "var(--color-border)" }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-secondary)" }}
      >
        <Icon name={icon} size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </p>
        <p
          className="text-[13px] mt-0.5 truncate"
          style={{ color: empty ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
        >
          {value}
        </p>
      </div>
      {copyable && !empty && (
        <button
          type="button"
          className="icon-btn shrink-0"
          title="Copier"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
        </button>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, token, updatePresence, updateProfile } = useAuthStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [statusMessage, setStatusMessage] = useState(user?.statusMessage ?? "");
  const [editingStatus, setEditingStatus] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  if (!user) return null;

  const hue = hueOf(user.displayName);
  const presence = PRESENCE_OPTIONS.find((p) => p.value === user.presenceStatus) ?? PRESENCE_OPTIONS[0];
  const roleLabel = user.role === "system_admin" ? "Administrateur" : "Collaborateur";

  const markSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const saveStatus = () => {
    updateProfile({ statusMessage: statusMessage.trim() || null });
    setEditingStatus(false);
    markSaved();
  };

  const persistAvatar = async (dataUrl: string | null) => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      if (dataUrl) {
        const savedUrl = token ? await authService.updateMyAvatar(token, dataUrl) : dataUrl;
        updateProfile({ avatarPath: savedUrl });
        useToastStore.getState().push({ kind: "success", title: "Photo de profil mise à jour" });
      } else {
        if (token) await authService.clearMyAvatar(token);
        updateProfile({ avatarPath: null });
        useToastStore.getState().push({ kind: "info", title: "Photo de profil retirée" });
      }
      markSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAvatarError(msg);
      useToastStore.getState().push({ kind: "error", title: "Photo de profil", detail: msg });
    } finally {
      setAvatarBusy(false);
    }
  };

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await prepareProfileAvatar(file);
      await persistAvatar(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAvatarError(msg);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
      <div
        className="flex items-center gap-2 px-5 shrink-0 sticky top-0 z-10"
        style={{ height: 60, backgroundColor: "var(--color-header-bg)", borderBottom: "1px solid var(--color-border)" }}
      >
        <button type="button" onClick={() => navigate(-1)} className="icon-btn shrink-0">
          <Icon name="chevronLeft" size={20} />
        </button>
        <h1 className="font-semibold text-[16px] tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Mon profil
        </h1>
        {saved && (
          <span className="ml-auto text-[12px] font-semibold" style={{ color: "var(--color-primary-600)" }}>
            Enregistré
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-7 space-y-5">
          {/* Identity */}
          <section
            className="rounded-2xl border overflow-hidden"
            style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <div className="flex items-center gap-5 p-6">
              <div className="relative shrink-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  className="hidden"
                  onChange={onPickAvatar}
                />
                <button
                  type="button"
                  disabled={avatarBusy}
                  title="Changer la photo de profil"
                  onClick={() => fileRef.current?.click()}
                  className="group relative w-[84px] h-[84px] rounded-2xl flex items-center justify-center text-white text-[28px] font-semibold overflow-hidden"
                  style={{ backgroundColor: `hsl(${hue}, 42%, 42%)` }}
                >
                  {user.avatarPath ? (
                    <img src={user.avatarPath} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initialsOf(user.displayName)
                  )}
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                      avatarBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    }`}
                  >
                    {avatarBusy ? (
                      <Icon name="loader" size={22} className="animate-spin text-white" />
                    ) : (
                      <Icon name="camera" size={22} className="text-white" />
                    )}
                  </span>
                </button>
                {user.avatarPath && (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    title="Retirer la photo"
                    onClick={() => void persistAvatar(null)}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg flex items-center justify-center border"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-semibold tracking-tight truncate" style={{ color: "var(--color-text-primary)" }}>
                    {user.displayName}
                  </h2>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-secondary)" }}
                  >
                    {roleLabel}
                  </span>
                </div>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  @{user.username}
                </p>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: presence.color }} />
                  <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {presence.label}
                    {user.statusMessage ? ` · ${user.statusMessage}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => fileRef.current?.click()}
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--color-primary-600)" }}
                  >
                    {user.avatarPath ? "Changer la photo" : "Ajouter une photo"}
                  </button>
                  {user.avatarPath && (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => void persistAvatar(null)}
                      className="text-[12px] font-medium"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {avatarError && (
                  <p className="text-[12px] mt-2" style={{ color: "var(--accent-red)" }}>
                    {avatarError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="icon-btn shrink-0"
                title="Paramètres"
              >
                <Icon name="settings" size={18} />
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Presence */}
            <section
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Présence
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  Visible par vos collègues
                </p>
              </div>
              <div className="p-2">
                {PRESENCE_OPTIONS.map((p) => {
                  const on = user.presenceStatus === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => updatePresence(p.value)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                      style={{ backgroundColor: on ? "var(--color-active)" : "transparent" }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {p.label}
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {p.hint}
                        </span>
                      </span>
                      {on && <Icon name="check" size={16} style={{ color: "var(--color-primary-500)" }} />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Status message */}
            <section
              className="rounded-2xl border overflow-hidden flex flex-col"
              style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
                <div>
                  <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Message de statut
                  </h3>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    Affiché sous votre nom
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (editingStatus) setStatusMessage(user.statusMessage ?? "");
                    setEditingStatus((v) => !v);
                  }}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--color-primary-600)" }}
                >
                  {editingStatus ? "Annuler" : "Modifier"}
                </button>
              </div>
              <div className="p-4 flex-1">
                {editingStatus ? (
                  <div className="space-y-3">
                    <textarea
                      autoFocus
                      value={statusMessage}
                      onChange={(e) => setStatusMessage(e.target.value.slice(0, 140))}
                      maxLength={140}
                      rows={3}
                      placeholder="Disponible pour toute question…"
                      className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none border resize-none"
                      style={{
                        backgroundColor: "var(--color-input-bg)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-primary)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveStatus();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {statusMessage.length}/140
                      </span>
                      <button
                        type="button"
                        onClick={saveStatus}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
                        style={{ backgroundColor: "var(--color-primary-500)" }}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed" style={{ color: statusMessage ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}>
                    {statusMessage || "Aucun message de statut"}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Directory */}
          <section
            className="rounded-2xl border overflow-hidden"
            style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Annuaire
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Informations issues de l’annuaire d’entreprise
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              <InfoRow icon="mail" label="E-mail" value={user.email ?? "Non renseigné"} copyable />
              <InfoRow icon="phone" label="Téléphone" value={user.phone ?? "Non renseigné"} copyable />
              <InfoRow icon="users" label="Département" value={user.department ?? "Non renseigné"} />
              <InfoRow icon="user" label="Poste" value={user.title ?? "Non renseigné"} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
