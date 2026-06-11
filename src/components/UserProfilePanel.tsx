import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { chatService } from "@/services/chatService";
import type { ParticipantInfo, MediaItem, AttachmentDto } from "@/services/chatService";
import { useResizable } from "@/hooks/useResizable";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { isImage, getFileColor, getFileExt, formatFileSize } from "@/utils/fileUtils";

const presenceLabel: Record<string, string> = {
  online: "En ligne", away: "Absent", busy: "Occupé", offline: "Hors ligne",
};
const presenceColor: Record<string, string> = {
  online: "#22c55e", away: "#f59e0b", busy: "#ef4444", offline: "var(--color-text-muted)",
};

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
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<{ att: AttachmentDto; senderName: string | null } | null>(null);

  const { size: panelWidth, dragHandleProps } = useResizable(320, 240, 600, "left");

  const isMe = participant.userId === currentUser?.id;
  const hue = participant.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  useEffect(() => {
    if (!conversationId) return;
    setMediaLoading(true);
    chatService
      .getConversationMedia(conversationId)
      .then(setMediaItems)
      .catch(() => {})
      .finally(() => setMediaLoading(false));
  }, [conversationId]);

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
        {/* ── Drag handle ──────────────────────────────────────────────────── */}
        <div
          {...dragHandleProps}
          className="w-1 h-full absolute left-0 top-0 z-10"
          style={{ ...dragHandleProps.style, backgroundColor: "var(--color-border)" }}
        />

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
            <div className="flex flex-col items-center py-6 px-4" style={{ backgroundColor: "var(--color-header-bg)" }}>
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

            {/* Shared media */}
            {conversationId && (
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
                      {t === "photos" ? `Photos (${photoItems.length})` : `Docs (${docItems.length})`}
                    </button>
                  ))}
                </div>

                {mediaLoading ? (
                  <div className="flex justify-center py-6">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : mediaTab === "photos" ? (
                  photoItems.length === 0 ? (
                    <p className="text-xs text-center py-6" style={{ color: "var(--color-text-muted)" }}>
                      Aucune photo partagée
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {photoItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => openMediaPreview(item)}
                          className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity focus:outline-none"
                          title={item.fileName}
                        >
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.fileName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )
                ) : docItems.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--color-text-muted)" }}>
                    Aucun document partagé
                  </p>
                ) : (
                  <div className="space-y-2">
                    {docItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openMediaPreview(item)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:opacity-90 transition-opacity focus:outline-none"
                        style={{ backgroundColor: "var(--color-surface-secondary)" }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: getFileColor(item.fileType) }}>
                          {getFileExt(item.fileName, item.fileType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{item.fileName}</div>
                          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(item.fileSize)}</div>
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
