import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { wsService } from "@/services/wsService";
import { MessageBubble, DateSeparator, formatDateSeparator } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { GroupDetailsPanel } from "@/components/GroupDetailsPanel";
import { UserProfilePanel } from "@/components/UserProfilePanel";
import type { MessageDto } from "@/services/chatService";
import { isSameDay } from "date-fns";

function shouldShowDateSeparator(prev: MessageDto | null, curr: MessageDto): boolean {
  if (!prev) return true;
  return !isSameDay(new Date(prev.createdAt), new Date(curr.createdAt));
}

function shouldShowSenderName(msgs: MessageDto[], index: number): boolean {
  if (index === 0) return true;
  const curr = msgs[index];
  const prev = msgs[index - 1];
  if (curr.senderId !== prev.senderId) return true;
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff > 5 * 60 * 1000;
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const convId = Number(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();

  const {
    conversations,
    messagesMap,
    typingMap,
    isLoadingMessages,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    markAsRead,
    setCurrentConversation,
  } = useChatStore();

  const hasMoreRef = useRef<Record<number, boolean>>({});
  hasMoreRef.current = hasMoreMessages;

  const conversation = conversations.find((c) => c.id === convId);
  const messages = messagesMap[convId] ?? [];
  const typingUsers = (typingMap[convId] ?? []).filter((u) => u.userId !== user?.id);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolledToBottom, setScrolledToBottom] = useState(true);
  const [showPanel, setShowPanel] = useState<"group" | "user" | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const isInitialLoad = useRef(true);

  // Load messages on mount / conversation change
  useEffect(() => {
    if (!convId) return;
    isInitialLoad.current = true;
    setCurrentConversation(convId);
    loadMessages(convId).then(() => {
      markAsRead(convId);
    });
    return () => {
      setCurrentConversation(null);
    };
  }, [convId]);

  // Handle ?highlight=<msgId> from global search navigation
  useEffect(() => {
    const highlightParam = searchParams.get("highlight");
    if (!highlightParam) return;
    const msgId = Number(highlightParam);
    if (!msgId) return;

    // Remove the param from URL without re-navigating
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("highlight");
      return next;
    }, { replace: true });

    setHighlightedMessageId(msgId);

    // Scroll to the message; if not yet in DOM, load older pages until found
    let cancelled = false;
    const scrollToHighlight = async () => {
      // Give the initial loadMessages a moment to render
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;

      // Try to find & scroll; if not found, keep loading older pages
      let attempts = 0;
      while (!cancelled) {
        const el = document.getElementById(`message-${msgId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            if (!cancelled) setHighlightedMessageId(null);
          }, 2500);
          return;
        }

        attempts++;
        // After a few quick retries (initial render lag), load more if possible
        if (attempts >= 5) {
          if (!hasMoreRef.current[convId]) break;
          await loadMoreMessages(convId);
          await new Promise((r) => setTimeout(r, 200));
        } else {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      // Message not found even after loading all history — still highlight if it's in store
      if (!cancelled) {
        const el = document.getElementById(`message-${msgId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          if (!cancelled) setHighlightedMessageId(null);
        }, 2500);
      }
    };

    scrollToHighlight();
    return () => { cancelled = true; };
  }, [searchParams]);

  // Scroll to bottom on initial load or new incoming messages
  useEffect(() => {
    if (messages.length === 0) return;
    if (isInitialLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      isInitialLoad.current = false;
      return;
    }
    if (scrolledToBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, typingUsers.length]);

  // Track scroll position for "load more" and auto-scroll logic
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setScrolledToBottom(atBottom);
    if (el.scrollTop < 60 && hasMoreMessages[convId] && !isLoadingMessages) {
      const prevHeight = el.scrollHeight;
      loadMoreMessages(convId).then(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [convId, hasMoreMessages, isLoadingMessages]);

  const handleTyping = useCallback(() => {
    wsService.sendTyping(convId);
  }, [convId]);

  const handleSend = useCallback(
    (content: string, replyToId?: number) => {
      sendMessage(convId, content, replyToId);
    },
    [convId, sendMessage]
  );

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  if (!conversation) {
    return (
      <div className="chat-bg flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Conversation introuvable
        </p>
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter((p) => p.userId !== user?.id);
  const isGroup = conversation.convType === "group";

  const presenceStatus = !isGroup ? otherParticipants[0]?.presenceStatus : null;
  const presenceColors: Record<string, string> = {
    online: "#22c55e",
    away: "#f59e0b",
    busy: "#ef4444",
    offline: "var(--color-text-muted)",
  };
  const presenceLabels: Record<string, string> = {
    online: "En ligne",
    away: "Absent",
    busy: "Occupé",
    offline: "Hors ligne",
  };

  const handleHeaderClick = () => {
    if (isGroup) setShowPanel((v) => v === "group" ? null : "group");
    else if (otherParticipants[0]) setShowPanel((v) => v === "user" ? null : "user");
  };

  return (
    <div className="flex h-full" style={{ backgroundColor: "var(--color-surface)" }}>
      {/* ── Main chat column ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0 border-b"
        style={{
          backgroundColor: "var(--color-header-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Back button on narrow screens */}
        <button
          onClick={() => navigate("/")}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-full"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Avatar + name — clickable to open panel */}
        <button
          onClick={handleHeaderClick}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="relative shrink-0">
            {conversation.avatarPath ? (
              <img src={conversation.avatarPath} alt={conversation.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{
                  backgroundColor: `hsl(${conversation.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 45%)`,
                }}
              >
                {conversation.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            {presenceStatus && presenceStatus !== "offline" && (
              <span
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                style={{ backgroundColor: presenceColors[presenceStatus], borderColor: "var(--color-header-bg)" }}
              />
            )}
          </div>

          {/* Name & status */}
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
              {conversation.name}
            </h2>
            {isGroup ? (
              <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                {conversation.participants.length} participants
                {otherParticipants.filter((p) => p.presenceStatus === "online").length > 0 && (
                  <> · {otherParticipants.filter((p) => p.presenceStatus === "online").length} en ligne</>
                )}
              </p>
            ) : (
              presenceStatus && (
                <p className="text-xs" style={{ color: presenceColors[presenceStatus] }}>
                  {presenceLabels[presenceStatus]}
                </p>
              )
            )}
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{ color: searchOpen ? "var(--color-primary-500)" : "var(--color-text-muted)" }}
            title="Rechercher"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {/* Info panel toggle */}
          <button
            onClick={handleHeaderClick}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{ color: showPanel ? "var(--color-primary-500)" : "var(--color-text-muted)" }}
            title={isGroup ? "Infos groupe" : "Profil"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────── */}
      {searchOpen && (
        <div
          className="px-4 py-2 shrink-0 border-b"
          style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}
        >
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans les messages…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text-primary)" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ color: "var(--color-text-muted)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              {filteredMessages.length} résultat{filteredMessages.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* ── Messages area ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="chat-bg flex-1 overflow-y-auto py-2"
        onScroll={handleScroll}
      >
        {/* Load more indicator */}
        {hasMoreMessages[convId] && (
          <div className="flex justify-center py-3">
            {isLoadingMessages ? (
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Défiler pour charger plus
              </span>
            )}
          </div>
        )}

        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : filteredMessages.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Aucun message trouvé</p>
          </div>
        ) : (
          filteredMessages.map((msg, i) => {
            const showDate = shouldShowDateSeparator(filteredMessages[i - 1] ?? null, msg);
            const showName = isGroup && shouldShowSenderName(filteredMessages, i);
            const isHighlighted = highlightedMessageId === msg.id;
            return (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                style={{
                  transition: "background-color 0.4s ease",
                  backgroundColor: isHighlighted ? "var(--color-primary-500)" + "22" : "transparent",
                  borderRadius: isHighlighted ? 8 : 0,
                }}
              >
                {showDate && (
                  <DateSeparator label={formatDateSeparator(msg.createdAt)} />
                )}
                <MessageBubble
                  message={msg}
                  showSenderName={showName}
                  onReply={setReplyTo}
                />
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex gap-1 items-center px-3 py-2 rounded-2xl shadow-sm" style={{ backgroundColor: "var(--color-surface)" }}>
              <span className="text-xs mr-1" style={{ color: "var(--color-text-muted)" }}>
                {typingUsers.map((u) => u.displayName).join(", ")}
              </span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      backgroundColor: "var(--color-primary-500)",
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Scroll-to-bottom fab ────────────────────────────────── */}
      {!scrolledToBottom && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-20 right-6 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all"
          style={{ backgroundColor: "var(--color-surface)", color: "var(--color-primary-500)", border: "1px solid var(--color-border)", zIndex: 10 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* ── Input ───────────────────────────────────────────────── */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
      </div>{/* end main chat column */}

      {/* ── Side panels ─────────────────────────────────────────── */}
      {showPanel === "group" && (
        <GroupDetailsPanel
          conversation={conversation}
          onClose={() => setShowPanel(null)}
        />
      )}
      {showPanel === "user" && otherParticipants[0] && (
        <UserProfilePanel
          participant={otherParticipants[0]}
          conversationId={convId}
          onClose={() => setShowPanel(null)}
          onSendMessage={() => setShowPanel(null)}
        />
      )}
    </div>
  );
}
