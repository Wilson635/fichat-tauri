import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { chatService } from "@/services/chatService";
import { SYSTEM_USERS } from "@/services/mockDb";
import type { ConversationSummary, UserForChat, MediaItem, AttachmentDto } from "@/services/chatService";
import { useResizable } from "@/hooks/useResizable";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { isImage, getFileColor, getFileExt, formatFileSize } from "@/utils/fileUtils";

const presenceColors: Record<string, string> = {
  online: "#22c55e", away: "#f59e0b", busy: "#ef4444", offline: "var(--color-border)",
};

interface Props {
  conversation: ConversationSummary;
  onClose: () => void;
}

export function GroupDetailsPanel({ conversation, onClose }: Props) {
  const { user } = useAuthStore();
  const { addGroupMember, removeGroupMember, updateGroupMemberRole } = useChatStore();
  const [tab, setTab] = useState<"members" | "media" | "events">("members");
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchAdd, setSearchAdd] = useState("");
  const [allUsers, setAllUsers] = useState<UserForChat[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loadingMember, setLoadingMember] = useState<number | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaTab, setMediaTab] = useState<"photos" | "docs">("photos");
  const [previewAtt, setPreviewAtt] = useState<{ att: AttachmentDto; senderName: string | null } | null>(null);

  const { size: panelWidth, dragHandleProps } = useResizable(320, 240, 600, "left");

  useEffect(() => {
    chatService.listUsers().then(setAllUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "media") return;
    setMediaLoading(true);
    chatService
      .getConversationMedia(conversation.id)
      .then(setMediaItems)
      .catch(() => {})
      .finally(() => setMediaLoading(false));
  }, [tab, conversation.id]);

  const members = conversation.participants;
  const currentMember = members.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === "admin";
  const memberIds = new Set(members.map((m) => m.userId));

  const addableUsers = allUsers.filter(
    (u) => !memberIds.has(u.id) && u.displayName.toLowerCase().includes(searchAdd.toLowerCase()),
  );

  const handleAddMember = async (u: UserForChat) => {
    setLoadingMember(u.id);
    try { await addGroupMember(conversation.id, u.id); setSearchAdd(""); setShowAddMember(false); }
    finally { setLoadingMember(null); }
  };
  const handleRemove = async (userId: number) => {
    setLoadingMember(userId);
    try { await removeGroupMember(conversation.id, userId); }
    finally { setLoadingMember(null); }
  };
  const handlePromote = async (userId: number) => {
    setLoadingMember(userId);
    try { await updateGroupMemberRole(conversation.id, userId, "admin"); }
    finally { setLoadingMember(null); }
  };
  const handleDemote = async (userId: number) => {
    setLoadingMember(userId);
    try { await updateGroupMemberRole(conversation.id, userId, "member"); }
    finally { setLoadingMember(null); }
  };

  const hue = (s: string) => s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const userDept = (userId: number) => SYSTEM_USERS.find((u) => u.id === userId)?.department ?? "—";

  // Separate images and documents
  const photoItems = mediaItems.filter((m) => isImage(m.fileType));
  const docItems = mediaItems.filter((m) => !isImage(m.fileType));

  const openMediaPreview = (item: MediaItem) => {
    const att: AttachmentDto = {
      id: item.id,
      fileName: item.fileName,
      filePath: item.filePath,
      fileType: item.fileType,
      fileSize: item.fileSize,
      thumbnail: item.thumbnail,
    };
    setPreviewAtt({ att, senderName: item.senderName });
  };

  return (
    <>
      <div className="flex h-full relative">
        {/* ── Drag handle (left edge) ──────────────────────────────────────── */}
        <div
          {...dragHandleProps}
          className="w-1 h-full absolute left-0 top-0 z-10 group"
          style={{ ...dragHandleProps.style, backgroundColor: "transparent" }}
        >
          <div className="w-1 h-full group-hover:bg-primary-500 transition-colors" style={{ backgroundColor: "var(--color-border)" }} />
        </div>

        <div
          className="flex flex-col h-full border-l"
          style={{ width: panelWidth, minWidth: 240, maxWidth: 600, backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ backgroundColor: "var(--color-header-bg)", borderColor: "var(--color-border)" }}>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0" style={{ color: "var(--color-text-muted)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Infos du groupe</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Group identity */}
            <div className="flex flex-col items-center py-6 px-4" style={{ backgroundColor: "var(--color-header-bg)" }}>
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3" style={{ backgroundColor: `hsl(${hue(conversation.name)}, 55%, 45%)` }}>
                {conversation.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <h2 className="font-bold text-lg text-center" style={{ color: "var(--color-text-primary)" }}>{conversation.name}</h2>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                Groupe · {members.length} participant{members.length > 1 ? "s" : ""}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
              {(["members", "media", "events"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color: tab === t ? "var(--color-primary-500)" : "var(--color-text-muted)",
                    borderBottom: tab === t ? "2px solid var(--color-primary-500)" : "2px solid transparent",
                  }}
                >
                  {t === "members" ? "Membres" : t === "media" ? "Médias" : "Activité"}
                </button>
              ))}
            </div>

            {/* ── Members tab ─────────────────────────────────────────────── */}
            {tab === "members" && (
              <div className="py-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowAddMember((v) => !v)}
                    className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ color: "var(--color-primary-500)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-dashed" style={{ borderColor: "var(--color-primary-500)" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">Ajouter des participants</span>
                  </button>
                )}

                {showAddMember && (
                  <div className="px-4 py-2 border-b" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-secondary)" }}>
                    <input
                      autoFocus
                      type="text"
                      value={searchAdd}
                      onChange={(e) => setSearchAdd(e.target.value)}
                      placeholder="Rechercher un utilisateur…"
                      className="w-full bg-transparent text-sm outline-none px-3 py-2 rounded-lg border"
                      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    />
                    {addableUsers.length > 0 ? (
                      addableUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleAddMember(u)}
                          disabled={loadingMember === u.id}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg mt-1 hover:bg-black/5 dark:hover:bg-white/5 text-left disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: `hsl(${hue(u.displayName)}, 55%, 45%)` }}>
                            {u.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{u.displayName}</div>
                            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{u.department}</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
                        {searchAdd ? "Aucun résultat" : "Tous les utilisateurs sont membres"}
                      </p>
                    )}
                  </div>
                )}

                {members.map((m) => {
                  const isMe = m.userId === user?.id;
                  return (
                    <div
                      key={m.userId}
                      className="flex items-center gap-3 px-4 py-2.5 group"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: `hsl(${hue(m.displayName)}, 55%, 45%)` }}>
                          {m.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2" style={{ backgroundColor: presenceColors[m.presenceStatus] ?? presenceColors.offline, borderColor: "var(--color-surface)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                            {m.displayName}{isMe ? " (vous)" : ""}
                          </span>
                          {m.role === "admin" && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: "rgba(124,58,237,0.12)", color: "#7c3aed" }}>
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{userDept(m.userId)}</div>
                      </div>

                      {isAdmin && !isMe && loadingMember !== m.userId && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {m.role !== "admin" ? (
                            <button onClick={() => handlePromote(m.userId)} title="Promouvoir admin" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#7c3aed" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
                              </svg>
                            </button>
                          ) : (
                            <button onClick={() => handleDemote(m.userId)} title="Retirer admin" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#ea580c" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z" />
                              </svg>
                            </button>
                          )}
                          <button onClick={() => handleRemove(m.userId)} title="Retirer du groupe" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {loadingMember === m.userId && (
                        <div className="w-5 h-5 shrink-0 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-primary-500)", borderTopColor: "transparent" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Media tab ───────────────────────────────────────────────── */}
            {tab === "media" && (
              <div className="p-4 space-y-3">
                {/* Sub-tabs */}
                <div className="flex gap-2">
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
                      {t === "photos" ? `Photos/Vidéos (${photoItems.length})` : `Documents (${docItems.length})`}
                    </button>
                  ))}
                </div>

                {mediaLoading ? (
                  <div className="flex justify-center py-8">
                    <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : mediaTab === "photos" ? (
                  photoItems.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: "var(--color-text-muted)" }}>
                      Aucune photo ou vidéo partagée
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {photoItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => openMediaPreview(item)}
                          className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1"
                          style={{ "--tw-ring-color": "var(--color-primary-500)" } as any}
                          title={item.fileName}
                        >
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.fileName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )
                ) : docItems.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: "var(--color-text-muted)" }}>
                    Aucun document partagé
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {docItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openMediaPreview(item)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:opacity-90 transition-opacity focus:outline-none"
                        style={{ backgroundColor: "var(--color-surface-secondary)" }}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: getFileColor(item.fileType) }}>
                          {getFileExt(item.fileName, item.fileType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{item.fileName}</div>
                          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {[formatFileSize(item.fileSize), item.senderName].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-primary-500)" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Events tab ─────────────────────────────────────────────── */}
            {tab === "events" && (
              <div className="py-4">
                {[
                  { id: 1, text: `${user?.displayName ?? "Vous"} a créé le groupe`, time: "Lors de la création" },
                  ...members.filter((m) => m.userId !== user?.id).map((m, i) => ({
                    id: i + 2, text: `${m.displayName} a rejoint le groupe`, time: "Lors de la création",
                  })),
                ].map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "var(--color-primary-500)" }} />
                    <div className="flex-1">
                      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{e.text}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{e.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Danger zone */}
            <div className="p-4 border-t mt-2 space-y-2" style={{ borderColor: "var(--color-border)" }}>
              {!confirmLeave ? (
                <button
                  onClick={() => setConfirmLeave(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 transition-colors"
                  style={{ backgroundColor: "rgba(239,68,68,0.08)" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Quitter le groupe
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}>
                  <p className="text-sm text-center text-red-500 font-medium">Quitter le groupe ?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2 rounded-lg text-xs border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                      Annuler
                    </button>
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-500">
                      Quitter
                    </button>
                  </div>
                </div>
              )}
              {isAdmin && (
                <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 transition-colors" style={{ backgroundColor: "rgba(239,68,68,0.05)" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Dissoudre le groupe
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewAtt && (
        <FilePreviewModal
          attachment={previewAtt.att}
          senderName={previewAtt.senderName}
          onClose={() => setPreviewAtt(null)}
        />
      )}
    </>
  );
}
