import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { useAuthStore } from "@/store/authStore";
import { formatFileSize, isImage, isVideo, isAudio, isPdf, getFileColor, getFileExt } from "@/utils/fileUtils";

export function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

function formatMsgTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

function StatusIcon({ status }: { status: MessageDto["status"] }) {
  if (status === "sending") return (
    <svg className="w-3 h-3 opacity-60 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /></svg>
  );
  if (status === "sent") return (
    <svg className="w-3.5 h-3" viewBox="0 0 16 11" fill="currentColor" style={{ opacity: 0.7 }}>
      <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
    </svg>
  );
  if (status === "delivered") return (
    <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ opacity: 0.7 }}>
      <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
      <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
    </svg>
  );
  if (status === "read") return (
    <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ color: "var(--color-primary-300)" }}>
      <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
      <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
    </svg>
  );
  return null;
}

// ─── Single attachment renderer ───────────────────────────────────────────────
function AttachmentView({
  attachment,
  isOwn,
  onOpen,
}: {
  attachment: AttachmentDto;
  isOwn: boolean;
  onOpen: (att: AttachmentDto) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const thumb = attachment.thumbnail;

  if (isImage(attachment.fileType) && !imgError) {
    return (
      <button
        onClick={() => onOpen(attachment)}
        className="block rounded-xl overflow-hidden focus:outline-none mt-1"
        style={{ maxWidth: 280 }}
        title="Voir l'image"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={attachment.fileName}
            className="w-full object-cover"
            style={{ maxHeight: 220, display: "block" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex items-center justify-center w-48 h-32 rounded-xl" style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </button>
    );
  }

  if (isVideo(attachment.fileType)) {
    return (
      <button
        onClick={() => onOpen(attachment)}
        className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl focus:outline-none hover:opacity-90 transition-opacity"
        style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)", maxWidth: 280 }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.15)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#8b5cf6" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-medium truncate">{attachment.fileName}</p>
          <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    );
  }

  if (isAudio(attachment.fileType)) {
    return (
      <button
        onClick={() => onOpen(attachment)}
        className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl focus:outline-none hover:opacity-90 transition-opacity"
        style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)", maxWidth: 280 }}
      >
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(236,72,153,0.12)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#ec4899" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-medium truncate">{attachment.fileName}</p>
          <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
        </div>
      </button>
    );
  }

  // Generic file chip
  const extColor = getFileColor(attachment.fileType);
  const ext = getFileExt(attachment.fileName, attachment.fileType);

  return (
    <button
      onClick={() => onOpen(attachment)}
      className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl focus:outline-none hover:opacity-90 transition-opacity"
      style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)", maxWidth: 300 }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: extColor }}
      >
        {ext}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-semibold truncate">{attachment.fileName}</p>
        <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  message: MessageDto;
  showSenderName: boolean;
  onReply: (msg: MessageDto) => void;
  onOpenPreview?: (att: AttachmentDto) => void;
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
export function MessageBubble({ message, showSenderName, onReply, onOpenPreview }: Props) {
  const { user } = useAuthStore();
  const isOwn = message.senderId === user?.id;
  const [hovered, setHovered] = useState(false);

  // ── System messages ──────────────────────────────────────────────────────────
  if (message.messageType === "system") {
    return (
      <div className="flex justify-center my-2 px-4">
        <span
          className="text-xs px-3 py-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  // ── Deleted messages ─────────────────────────────────────────────────────────
  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
        <div
          className="px-3 py-2 rounded-lg text-sm italic max-w-xs"
          style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}
        >
          🚫 Message supprimé
        </div>
      </div>
    );
  }

  const initials = (message.senderName ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const hue = (message.senderName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  const hasText = !!message.content?.trim();
  const atts = message.attachments ?? [];

  // If only attachments (image) and no text — make the bubble transparent
  const bubbleStyle: React.CSSProperties = {
    backgroundColor: isOwn ? "var(--color-primary-500)" : "var(--color-surface)",
    borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    color: isOwn ? "#fff" : "var(--color-text-primary)",
  };

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1 group px-2`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isOwn && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mr-2 mt-1 self-end"
          style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
        >
          {initials}
        </div>
      )}

      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        {showSenderName && !isOwn && (
          <span className="text-xs font-semibold mb-1 ml-1" style={{ color: `hsl(${hue}, 55%, 45%)` }}>
            {message.senderName}
          </span>
        )}

        <div className="relative flex items-end gap-1">
          {/* Reply button (own messages, left side) */}
          {isOwn && hovered && (
            <button
              onClick={() => onReply(message)}
              className="w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "var(--color-surface-secondary)" }}
              title="Répondre"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}

          {/* Bubble */}
          <div className="px-3 py-2 rounded-2xl shadow-sm" style={bubbleStyle}>
            {/* Quote */}
            {message.replyToId && message.replyToContent && (
              <div
                className="mb-2 px-2 py-1.5 rounded-lg text-xs border-l-2 opacity-80"
                style={{
                  backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)",
                  borderColor: isOwn ? "rgba(255,255,255,0.6)" : "var(--color-primary-500)",
                }}
              >
                <span className="font-semibold block mb-0.5" style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)" }}>
                  Citation
                </span>
                <span className="line-clamp-2">{message.replyToContent}</span>
              </div>
            )}

            {/* Attachments */}
            {atts.map((att) => (
              <AttachmentView
                key={att.id}
                attachment={att}
                isOwn={isOwn}
                onOpen={(a) => onOpenPreview?.(a)}
              />
            ))}

            {/* Text content */}
            {hasText && (
              <span className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${atts.length > 0 ? "mt-1 block" : ""}`}>
                {message.content}
              </span>
            )}
            {message.isEdited && (
              <span className="text-xs ml-1 opacity-60">(modifié)</span>
            )}

            {/* Time + status */}
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              <span className="text-xs opacity-60">{formatMsgTime(message.createdAt)}</span>
              {isOwn && <span className="opacity-80"><StatusIcon status={message.status} /></span>}
            </div>
          </div>

          {/* Reply button (others, right side) */}
          {!isOwn && hovered && (
            <button
              onClick={() => onReply(message)}
              className="w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "var(--color-surface-secondary)" }}
              title="Répondre"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
      <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
    </div>
  );
}
