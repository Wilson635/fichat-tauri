import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { chatService } from "@/services/chatService";
import type { ConversationSummary, UserForChat, MediaItem, AttachmentDto } from "@/services/chatService";
import { useResizable } from "@/hooks/useResizable";
import { AttachmentVisualPreview, DocMetaRow } from "@/components/DocPreview";
import { isImage, isVideo, prepareProfileAvatar } from "@/utils/fileUtils";
import { Icon, type IconName } from "@/components/Icon";
import { ProfileAvatarGallery } from "@/components/ProfileAvatarGallery";
import { useToastStore } from "@/store/toastStore";

const presenceLabel: Record<string, string> = {
  online: "En ligne",
  away: "Absent",
  busy: "Occupé",
  offline: "Hors ligne",
};
const presenceColor: Record<string, string> = {
  online: "#22c55e",
  away: "#f59e0b",
  busy: "#ef4444",
  offline: "var(--color-text-muted)",
};

function initialsOf(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
function hueOf(name: string) {
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

function toAttachment(item: MediaItem): AttachmentDto {
  return {
    id: item.id,
    fileName: item.fileName,
    filePath: item.filePath,
    fileType: item.fileType,
    fileSize: item.fileSize,
    thumbnail: item.thumbnail,
  };
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  const empty = !value || value === "Non renseigné";
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="icon-well shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-surface-secondary)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </p>
        <p className="text-[13px] mt-0.5 truncate" style={{ color: empty ? "var(--color-text-muted)" : "var(--color-text-primary)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

interface Props {
  conversation: ConversationSummary;
  onClose: () => void;
  onOpenFile?: (att: AttachmentDto) => void;
}

export function ConversationInfoPanel({ conversation, onClose, onOpenFile }: Props) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { addGroupMember, removeGroupMember, updateGroupMemberRole, updateGroup } = useChatStore();
  const isGroup = conversation.convType === "group";
  const other = conversation.participants.find((p) => p.userId !== user?.id) ?? conversation.participants[0];
  const groupFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"infos" | "members" | "media">(isGroup ? "members" : "infos");
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchAdd, setSearchAdd] = useState("");
  const [allUsers, setAllUsers] = useState<UserForChat[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loadingMember, setLoadingMember] = useState<number | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaTab, setMediaTab] = useState<"photos" | "docs">("photos");
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupName, setGroupName] = useState(conversation.name);
  const [groupDesc, setGroupDesc] = useState(conversation.description ?? "");
  const [groupBusy, setGroupBusy] = useState(false);
  const [showGroupAvatars, setShowGroupAvatars] = useState(false);

  const { size: panelWidth, dragHandleProps } = useResizable(360, 300, 560, "left");

  useEffect(() => {
    chatService.listUsers().then(setAllUsers).catch(() => {});
  }, []);

  useEffect(() => {
    setMediaLoading(true);
    chatService
      .getConversationMedia(conversation.id)
      .then(setMediaItems)
      .catch(() => setMediaItems([]))
      .finally(() => setMediaLoading(false));
  }, [conversation.id]);

  useEffect(() => {
    setTab(isGroup ? "members" : "infos");
    setShowAddMember(false);
    setConfirmLeave(false);
    setEditingGroup(false);
    setGroupName(conversation.name);
    setGroupDesc(conversation.description ?? "");
    setShowGroupAvatars(false);
  }, [conversation.id, isGroup, conversation.name, conversation.description]);

  const members = conversation.participants;
  const currentMember = members.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === "admin";
  const orgLocked = Boolean(conversation.adSyncKey);
  const canEditGroup =
    isGroup &&
    conversation.membership !== "none" &&
    conversation.membership !== "pending" &&
    (isAdmin || user?.role === "system_admin");
  const memberIds = new Set(members.map((m) => m.userId));
  const usersById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);
  const directory = other ? usersById.get(other.userId) : undefined;

  const addableUsers = allUsers.filter(
    (u) => !memberIds.has(u.id) && u.displayName.toLowerCase().includes(searchAdd.toLowerCase()),
  );

  const photoItems = mediaItems.filter(
    (m) => isImage(m.fileType, m.fileName) || isVideo(m.fileType, m.fileName),
  );
  const docItems = mediaItems.filter(
    (m) => !isImage(m.fileType, m.fileName) && !isVideo(m.fileType, m.fileName),
  );

  const handleAddMember = async (u: UserForChat) => {
    setLoadingMember(u.id);
    try {
      await addGroupMember(conversation.id, u.id);
      setSearchAdd("");
      setShowAddMember(false);
    } finally {
      setLoadingMember(null);
    }
  };
  const handleRemove = async (userId: number) => {
    setLoadingMember(userId);
    try {
      await removeGroupMember(conversation.id, userId);
    } finally {
      setLoadingMember(null);
    }
  };
  const handlePromote = async (userId: number) => {
    setLoadingMember(userId);
    try {
      await updateGroupMemberRole(conversation.id, userId, "admin");
    } finally {
      setLoadingMember(null);
    }
  };
  const handleDemote = async (userId: number) => {
    setLoadingMember(userId);
    try {
      await updateGroupMemberRole(conversation.id, userId, "member");
    } finally {
      setLoadingMember(null);
    }
  };

  const saveGroupMeta = async (name: string, description: string, avatarPath: string | null) => {
    setGroupBusy(true);
    try {
      await updateGroup(conversation.id, name, description, avatarPath);
      useToastStore.getState().push({ kind: "success", title: "Groupe mis à jour" });
      setEditingGroup(false);
      setShowGroupAvatars(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      useToastStore.getState().push({ kind: "error", title: "Groupe", detail: msg });
    } finally {
      setGroupBusy(false);
    }
  };

  const onPickGroupAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await prepareProfileAvatar(file);
      await saveGroupMeta(
        editingGroup ? groupName : conversation.name,
        editingGroup ? groupDesc : (conversation.description ?? ""),
        url,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().push({ kind: "error", title: "Photo du groupe", detail: msg });
    }
  };

  const title = isGroup ? conversation.name : (other?.displayName ?? conversation.name);
  const hue = hueOf(title);
  const presence = !isGroup ? other?.presenceStatus : null;

  const tabs: { id: "infos" | "members" | "media"; label: string }[] = isGroup
    ? [
        { id: "infos", label: "Infos" },
        { id: "members", label: `Membres (${members.length})` },
        { id: "media", label: "Médias" },
      ]
    : [
        { id: "infos", label: "Infos" },
        { id: "media", label: "Médias" },
      ];

  return (
      <aside
        className="fichat-info-panel"
        style={{ width: panelWidth }}
      >
        <div className="fichat-info-resize" {...dragHandleProps} />

        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{ height: 60, borderBottom: "1px solid var(--color-border)", background: "var(--color-header-bg)" }}
        >
          <button type="button" className="icon-btn" onClick={onClose} title="Fermer">
            <Icon name="x" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold truncate tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              {isGroup ? "Infos du groupe" : "Infos de la conversation"}
            </h2>
            <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
              {isGroup ? `${members.length} participant${members.length > 1 ? "s" : ""}` : "Contact et fichiers partagés"}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 pt-5 pb-4 flex flex-col items-center text-center" style={{ background: "var(--color-header-bg)" }}>
            <input
              ref={groupFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={onPickGroupAvatar}
            />
            {canEditGroup ? (
              <button
                type="button"
                disabled={groupBusy}
                title="Changer la photo du groupe"
                onClick={() => setShowGroupAvatars((v) => !v)}
                className="group relative w-[84px] h-[84px] rounded-2xl flex items-center justify-center text-white text-[26px] font-semibold overflow-hidden"
                style={{ backgroundColor: `hsl(${hue}, 42%, 42%)` }}
              >
                {conversation.avatarPath ? (
                  <img src={conversation.avatarPath} alt="" className="w-full h-full object-cover" />
                ) : (
                  initialsOf(title)
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  {groupBusy ? (
                    <Icon name="loader" size={22} className="animate-spin text-white" />
                  ) : (
                    <Icon name="camera" size={22} className="text-white" />
                  )}
                </span>
              </button>
            ) : (
              <div
                className="w-[84px] h-[84px] rounded-2xl flex items-center justify-center text-white text-[26px] font-semibold overflow-hidden"
                style={{ backgroundColor: `hsl(${hue}, 42%, 42%)` }}
              >
                {conversation.avatarPath ? (
                  <img src={conversation.avatarPath} alt="" className="w-full h-full object-cover" />
                ) : (
                  initialsOf(title)
                )}
              </div>
            )}
            <h3 className="mt-3 text-[17px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              {title}
            </h3>
            {isGroup ? (
              <p className="text-[12px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                Groupe
                {conversation.createdByName ? ` · créé par ${conversation.createdByName}` : ""}
              </p>
            ) : (
              presence && (
                <p className="text-[12px] mt-1 font-medium" style={{ color: presenceColor[presence] }}>
                  {presenceLabel[presence] ?? "Hors ligne"}
                </p>
              )
            )}
            {canEditGroup && (
              <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
                <button
                  type="button"
                  disabled={groupBusy}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--color-primary-600)" }}
                  onClick={() => setShowGroupAvatars((v) => !v)}
                >
                  {showGroupAvatars ? "Masquer les avatars" : "Choisir un avatar"}
                </button>
                <button
                  type="button"
                  disabled={groupBusy}
                  className="text-[12px] font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => groupFileRef.current?.click()}
                >
                  Téléverser une image
                </button>
                {conversation.avatarPath && (
                  <button
                    type="button"
                    disabled={groupBusy}
                    className="text-[12px] font-medium"
                    style={{ color: "var(--color-text-muted)" }}
                    onClick={() => void saveGroupMeta(conversation.name, conversation.description ?? "", null)}
                  >
                    Retirer
                  </button>
                )}
              </div>
            )}
            {showGroupAvatars && canEditGroup && (
              <div className="w-full mt-3 text-left">
                <ProfileAvatarGallery
                  compact
                  selectedSrc={conversation.avatarPath}
                  busy={groupBusy}
                  onSelect={(src) =>
                    void saveGroupMeta(
                      editingGroup ? groupName : conversation.name,
                      editingGroup ? groupDesc : (conversation.description ?? ""),
                      src,
                    )
                  }
                  onUploadClick={() => groupFileRef.current?.click()}
                />
              </div>
            )}
          </div>

          <div className="flex px-3 gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex-1 py-2.5 text-[12px] font-semibold"
                style={{
                  color: tab === t.id ? "var(--color-primary-600)" : "var(--color-text-muted)",
                  borderBottom: tab === t.id ? "2px solid var(--color-primary-500)" : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "infos" && (
            <div className="p-3 space-y-3">
              <section className="rounded-2xl border overflow-hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                {isGroup ? (
                  <>
                    {editingGroup ? (
                      <div className="p-3.5 space-y-3">
                        <label className="block text-left">
                          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                            Nom du groupe
                          </span>
                          <input
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value.slice(0, 80))}
                            className="mt-1 w-full px-3 py-2 rounded-xl text-[13px] outline-none border"
                            style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          />
                        </label>
                        <label className="block text-left">
                          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                            Description
                          </span>
                          <textarea
                            value={groupDesc}
                            onChange={(e) => setGroupDesc(e.target.value.slice(0, 500))}
                            rows={3}
                            className="mt-1 w-full px-3 py-2 rounded-xl text-[13px] outline-none border resize-none"
                            style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                          />
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={groupBusy}
                            onClick={() => void saveGroupMeta(groupName, groupDesc, conversation.avatarPath)}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
                            style={{ backgroundColor: "var(--color-primary-500)" }}
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            disabled={groupBusy}
                            onClick={() => {
                              setEditingGroup(false);
                              setGroupName(conversation.name);
                              setGroupDesc(conversation.description ?? "");
                            }}
                            className="text-[12px] font-medium"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <InfoLine icon="users" label="Participants" value={`${members.length} membre${members.length > 1 ? "s" : ""}`} />
                        <InfoLine icon="user" label="Créé par" value={conversation.createdByName ?? "—"} />
                        <InfoLine
                          icon="info"
                          label="Description"
                          value={conversation.description?.trim() || "Aucune description"}
                        />
                        {canEditGroup && (
                          <button
                            type="button"
                            className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-semibold"
                            style={{ color: "var(--color-primary-600)", borderTop: "1px solid var(--color-border)" }}
                            onClick={() => {
                              setGroupName(conversation.name);
                              setGroupDesc(conversation.description ?? "");
                              setEditingGroup(true);
                            }}
                          >
                            Modifier le groupe
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <InfoLine icon="mail" label="E-mail" value={directory?.email ?? "Non renseigné"} />
                    <InfoLine icon="users" label="Département" value={directory?.department ?? "Non renseigné"} />
                    <InfoLine icon="user" label="Identifiant" value={directory?.username ?? "—"} />
                    {other?.userId === user?.id && (
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-semibold"
                        style={{ color: "var(--color-primary-600)", borderTop: "1px solid var(--color-border)" }}
                        onClick={() => {
                          onClose();
                          navigate("/profile");
                        }}
                      >
                        Modifier mon profil
                      </button>
                    )}
                  </>
                )}
              </section>

              <section className="rounded-2xl border overflow-hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Fichiers partagés</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {mediaItems.length} élément{mediaItems.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button type="button" className="text-[12px] font-semibold" style={{ color: "var(--color-primary-600)" }} onClick={() => setTab("media")}>
                    Voir tout
                  </button>
                </div>
                {photoItems.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1 px-3 pb-3">
                    {photoItems.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="aspect-square rounded-lg overflow-hidden"
                        onClick={() => onOpenFile?.(toAttachment(item))}
                        title={item.fileName}
                      >
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <AttachmentVisualPreview attachment={toAttachment(item)} variant="tile" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] px-3.5 pb-3" style={{ color: "var(--color-text-muted)" }}>
                    Aucun média pour le moment
                  </p>
                )}
              </section>
            </div>
          )}

          {tab === "members" && isGroup && (
            <div className="py-2">
              {orgLocked && (
                <p className="text-[12px] px-4 py-2" style={{ color: "var(--color-text-muted)" }}>
                  Appartenance gérée par l’Active Directory et les administrateurs FiEcho.
                </p>
              )}
              {isAdmin && !orgLocked && (
                <button
                  type="button"
                  onClick={() => setShowAddMember((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3"
                  style={{ color: "var(--color-primary-600)" }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-dashed" style={{ borderColor: "var(--color-primary-500)" }}>
                    <Icon name="userPlus" size={16} />
                  </div>
                  <span className="text-[13px] font-semibold">Ajouter des participants</span>
                </button>
              )}

              {showAddMember && (
                <div className="mx-3 mb-3 rounded-2xl border p-2" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-secondary)" }}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                    <Icon name="search" size={14} style={{ color: "var(--color-text-muted)" }} />
                    <input
                      autoFocus
                      type="text"
                      value={searchAdd}
                      onChange={(e) => setSearchAdd(e.target.value)}
                      placeholder="Rechercher un collègue…"
                      className="flex-1 bg-transparent text-[13px] outline-none"
                      style={{ color: "var(--color-text-primary)" }}
                    />
                  </div>
                  <div className="mt-1 max-h-48 overflow-y-auto">
                    {addableUsers.length === 0 ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-text-muted)" }}>
                        {searchAdd ? "Aucun résultat" : "Tous les utilisateurs sont membres"}
                      </p>
                    ) : (
                      addableUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleAddMember(u)}
                          disabled={loadingMember === u.id}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden" style={{ backgroundColor: `hsl(${hueOf(u.displayName)}, 42%, 42%)` }}>
                            {u.avatarPath ? (
                              <img src={u.avatarPath} alt="" className="w-full h-full object-cover" />
                            ) : (
                              initialsOf(u.displayName)
                            )}
                          </div>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{u.displayName}</span>
                            <span className="block text-[11px]" style={{ color: "var(--color-text-muted)" }}>{u.department ?? u.email ?? ""}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {members.map((m) => {
                const isMe = m.userId === user?.id;
                const dir = usersById.get(m.userId);
                const photo = (isMe ? user?.avatarPath : null) || m.avatarPath;
                return (
                  <div key={m.userId} className="flex items-center gap-3 px-4 py-2.5 group">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-semibold overflow-hidden" style={{ backgroundColor: `hsl(${hueOf(m.displayName)}, 42%, 42%)` }}>
                        {photo ? (
                          <img src={photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          initialsOf(m.displayName)
                        )}
                      </div>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                        style={{ backgroundColor: presenceColor[m.presenceStatus] ?? presenceColor.offline, borderColor: "var(--color-surface)" }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                          {m.displayName}{isMe ? " (vous)" : ""}
                        </span>
                        {m.role === "admin" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: "var(--color-active)", color: "var(--color-primary-700)" }}>
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                        {dir?.department ?? presenceLabel[m.presenceStatus] ?? ""}
                      </p>
                    </div>
                    {isAdmin && !orgLocked && !isMe && loadingMember !== m.userId && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        {m.role !== "admin" ? (
                          <button type="button" className="icon-btn" title="Promouvoir admin" onClick={() => handlePromote(m.userId)}>
                            <Icon name="star" size={14} />
                          </button>
                        ) : (
                          <button type="button" className="icon-btn" title="Retirer admin" onClick={() => handleDemote(m.userId)}>
                            <Icon name="user" size={14} />
                          </button>
                        )}
                        <button type="button" className="icon-btn" title="Retirer du groupe" onClick={() => handleRemove(m.userId)} style={{ color: "#ef4444" }}>
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    )}
                    {loadingMember === m.userId && (
                      <Icon name="loader" size={16} className="animate-spin shrink-0" style={{ color: "var(--color-primary-500)" }} />
                    )}
                  </div>
                );
              })}

              {!orgLocked && (
              <div className="p-3 mt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                {!confirmLeave ? (
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)" }}
                  >
                    <Icon name="logOut" size={15} />
                    Quitter le groupe
                  </button>
                ) : (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(239,68,68,0.08)" }}>
                    <p className="text-[13px] text-center font-medium" style={{ color: "#ef4444" }}>Quitter le groupe ?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmLeave(false)} className="flex-1 py-2 rounded-lg text-[12px] border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                        Annuler
                      </button>
                      <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: "#ef4444" }}>
                        Quitter
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {tab === "media" && (
            <div className="p-3 space-y-3">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--color-surface-secondary)" }}>
                {(["photos", "docs"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMediaTab(t)}
                    className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold"
                    style={{
                      background: mediaTab === t ? "var(--color-surface)" : "transparent",
                      color: mediaTab === t ? "var(--color-text-primary)" : "var(--color-text-muted)",
                      boxShadow: mediaTab === t ? "0 1px 2px rgba(15,23,42,0.06)" : "none",
                    }}
                  >
                    {t === "photos" ? `Médias (${photoItems.length})` : `Documents (${docItems.length})`}
                  </button>
                ))}
              </div>

              {mediaLoading ? (
                <div className="flex justify-center py-10">
                  <Icon name="loader" size={22} className="animate-spin" style={{ color: "var(--color-primary-500)" }} />
                </div>
              ) : mediaTab === "photos" ? (
                photoItems.length === 0 ? (
                  <p className="text-[12px] text-center py-10" style={{ color: "var(--color-text-muted)" }}>
                    Aucune photo ou vidéo partagée
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {photoItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpenFile?.(toAttachment(item))}
                        className="aspect-square rounded-lg overflow-hidden"
                        title={item.fileName}
                      >
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <AttachmentVisualPreview attachment={toAttachment(item)} variant="tile" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              ) : docItems.length === 0 ? (
                <p className="text-[12px] text-center py-10" style={{ color: "var(--color-text-muted)" }}>
                  Aucun document partagé
                </p>
              ) : (
                <div className="space-y-2">
                  {docItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenFile?.(toAttachment(item))}
                      className="w-full rounded-2xl border overflow-hidden text-left"
                      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                    >
                      <div className="h-[110px] overflow-hidden">
                        <AttachmentVisualPreview attachment={toAttachment(item)} variant="tile" />
                      </div>
                      <div className="px-2.5 py-2 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <DocMetaRow fileName={item.fileName} mime={item.fileType} fileSize={item.fileSize} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
  );
}
