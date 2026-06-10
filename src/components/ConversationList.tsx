import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { isToday, isYesterday, format } from "date-fns";
import type { ConversationSummary } from "@/services/chatService";

function formatConvTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  return format(d, "dd/MM/yy");
}

function ConversationAvatar({ conv, size = 46 }: { conv: ConversationSummary; size?: number }) {
  if (conv.avatarPath) {
    return (
      <img
        src={conv.avatarPath}
        alt={conv.name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  if (conv.convType === "group") {
    const others = conv.participants.filter((p) => {
      const uid = useAuthStore.getState().user?.id;
      return p.userId !== uid;
    });
    if (others.length >= 2) {
      return (
        <div
          className="rounded-full shrink-0 relative overflow-hidden"
          style={{ width: size, height: size }}
        >
          <div
            className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5"
            style={{ backgroundColor: "var(--color-border)" }}
          >
            {others.slice(0, 4).map((p, i) => (
              <div
                key={i}
                className="rounded-sm flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: `hsl(${(p.userId * 47) % 360}, 55%, 50%)` }}
              >
                {p.displayName[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  const initials = conv.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = conv.name
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}, 55%, 45%)`,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
}

function PresenceDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "#22c55e",
    away: "#f59e0b",
    busy: "#ef4444",
    offline: "var(--color-border)",
  };
  return (
    <span
      className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
      style={{
        backgroundColor: colors[status] ?? colors.offline,
        borderColor: "var(--color-surface)",
      }}
    />
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sending") {
    return (
      <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--color-text-muted)" }}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === "sent") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 11" fill="currentColor" style={{ color: "var(--color-text-muted)" }}>
        <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <svg className="w-4 h-3.5" viewBox="0 0 20 11" fill="currentColor" style={{ color: "var(--color-text-muted)" }}>
        <path d="M15.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L5.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053ZM5.071.653a.75.75 0 0 1 .053 1.059l-6.25 7-.036.039 1.085-1.218 5.09-5.822A.75.75 0 0 1 6.07.658l-.999-.005Z" />
        <path d="M19.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L9.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
      </svg>
    );
  }
  if (status === "read") {
    return (
      <svg className="w-4 h-3.5" viewBox="0 0 20 11" fill="currentColor" style={{ color: "var(--color-primary-500)" }}>
        <path d="M15.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L5.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053ZM5.071.653a.75.75 0 0 1 .053 1.059l-6.25 7-.036.039 1.085-1.218 5.09-5.822A.75.75 0 0 1 6.07.658l-.999-.005Z" />
        <path d="M19.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L9.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
      </svg>
    );
  }
  return null;
}

interface Props {
  searchQuery: string;
  onNewGroup?: () => void;
}

export function ConversationList({ searchQuery, onNewGroup }: Props) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const activeId = params.id ? Number(params.id) : null;

  const { conversations, isLoadingConversations, loadConversations, connectWs } = useChatStore();
  const { user } = useAuthStore();
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      loadConversations();
      connectWs();
    }
  }, []);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  if (isLoadingConversations) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
            <div className="w-11 h-11 rounded-full shrink-0" style={{ backgroundColor: "var(--color-surface-secondary)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded w-24" style={{ backgroundColor: "var(--color-surface-secondary)" }} />
              <div className="h-3 rounded w-36" style={{ backgroundColor: "var(--color-surface-secondary)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--color-text-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {searchQuery ? "Aucun résultat" : "Aucune conversation"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {filtered.map((conv) => {
        const isActive = conv.id === activeId;
        const otherParticipants = conv.participants.filter((p) => p.userId !== user?.id);
        const presenceStatus = conv.convType === "direct" ? otherParticipants[0]?.presenceStatus : null;

        const lastMsgs = useChatStore.getState().messagesMap[conv.id] ?? [];
        const lastOwnMsg = [...lastMsgs].reverse().find((m) => m.senderId === user?.id);

        return (
          <button
            key={conv.id}
            onClick={() => navigate(`/conversations/${conv.id}`)}
            className="w-full flex items-center gap-3 px-3 py-3 transition-colors text-left"
            style={{
              backgroundColor: isActive
                ? "var(--color-active)"
                : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            <div className="relative shrink-0">
              <ConversationAvatar conv={conv} size={46} />
              {presenceStatus && presenceStatus !== "offline" && (
                <PresenceDot status={presenceStatus} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span
                  className="font-medium text-sm truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {conv.name}
                </span>
                <span
                  className="text-xs shrink-0"
                  style={{ color: conv.unreadCount > 0 ? "var(--color-primary-500)" : "var(--color-text-muted)" }}
                >
                  {formatConvTime(conv.lastMessageAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 mt-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  {lastOwnMsg && (
                    <span className="shrink-0">
                      <StatusIcon status={lastOwnMsg.status} />
                    </span>
                  )}
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {conv.lastMessage ?? "Aucun message"}
                  </span>
                </div>
                {conv.unreadCount > 0 && (
                  <span
                    className="shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-xs font-bold text-white px-1"
                    style={{ backgroundColor: "var(--color-primary-500)" }}
                  >
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
