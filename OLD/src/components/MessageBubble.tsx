import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import type { MessageDto } from "@/services/chatService";
import { useAuthStore } from "@/store/authStore";

function formatMsgTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

export function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

function StatusIcon({ status }: { status: MessageDto["status"] }) {
  if (status === "sending") {
    return (
      <svg className="w-3 h-3 opacity-60 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  }
  if (status === "sent") {
    return (
      <svg className="w-3.5 h-3" viewBox="0 0 16 11" fill="currentColor" style={{ opacity: 0.7 }}>
        <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ opacity: 0.7 }}>
        <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
        <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
      </svg>
    );
  }
  if (status === "read") {
    return (
      <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ color: "var(--color-primary-300)" }}>
        <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
        <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
      </svg>
    );
  }
  return null;
}

interface Props {
  message: MessageDto;
  showSenderName: boolean;
  onReply: (msg: MessageDto) => void;
}

export function MessageBubble({ message, showSenderName, onReply }: Props) {
  const { user } = useAuthStore();
  const isOwn = message.senderId === user?.id;
  const [hovered, setHovered] = useState(false);

  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
        <div
          className="px-3 py-2 rounded-lg text-sm italic max-w-xs"
          style={{
            backgroundColor: "var(--color-surface-secondary)",
            color: "var(--color-text-muted)",
          }}
        >
          🚫 Message supprimé
        </div>
      </div>
    );
  }

  const initials = (message.senderName ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = (message.senderName ?? "")
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

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

      <div className={`flex flex-col max-w-[65%] ${isOwn ? "items-end" : "items-start"}`}>
        {showSenderName && !isOwn && (
          <span
            className="text-xs font-semibold mb-1 ml-1"
            style={{ color: `hsl(${hue}, 55%, 45%)` }}
          >
            {message.senderName}
          </span>
        )}

        <div className="relative flex items-end gap-1">
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

          <div
            className="px-3 py-2 rounded-2xl shadow-sm"
            style={{
              backgroundColor: isOwn
                ? "var(--color-primary-500)"
                : "var(--color-surface)",
              borderRadius: isOwn
                ? "18px 18px 4px 18px"
                : "18px 18px 18px 4px",
              color: isOwn ? "#fff" : "var(--color-text-primary)",
            }}
          >
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

            <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </span>
            {message.isEdited && (
              <span className="text-xs ml-1 opacity-60">(modifié)</span>
            )}

            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-end"}`}>
              <span className="text-xs opacity-60">
                {formatMsgTime(message.createdAt)}
              </span>
              {isOwn && (
                <span className="opacity-80">
                  <StatusIcon status={message.status} />
                </span>
              )}
            </div>
          </div>

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
      <span
        className="text-xs font-medium px-3 py-1 rounded-full"
        style={{
          backgroundColor: "var(--color-surface-secondary)",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
    </div>
  );
}
