import { create } from "zustand";
import { chatService, ConversationSummary, MessageDto, ParticipantInfo } from "@/services/chatService";
import { wsService } from "@/services/wsService";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";

// ─── Mock auto-reply messages per conversation ────────────────────────────────
const AUTO_REPLIES: Record<number, { userId: number; name: string; replies: string[] }> = {
  1: {
    userId: 2,
    name: "Alice Martin",
    replies: [
      "D'accord, je prends note !",
      "Merci pour l'information.",
      "Parfait, on fait comme ça.",
      "Je vous tiens au courant.",
      "Très bien, à bientôt !",
    ],
  },
  2: {
    userId: 5,
    name: "David Moreau",
    replies: [
      "Bien reçu, je m'en occupe.",
      "Top, on avance !",
      "OK pour moi.",
      "Je valide de mon côté.",
    ],
  },
  3: {
    userId: 3,
    name: "Bob Dupont",
    replies: [
      "Compris, merci !",
      "Je reviens vers vous rapidement.",
      "Noté !",
      "Super, merci.",
    ],
  },
  4: {
    userId: 4,
    name: "Claire Bernard",
    replies: [
      "C'est enregistré.",
      "Je transmets à l'équipe.",
      "Bien reçu.",
    ],
  },
  5: {
    userId: 4,
    name: "Claire Bernard",
    replies: [
      "Parfait !",
      "Je vous envoie les détails.",
      "Très bien, merci.",
    ],
  },
};

// ─── Typing state ─────────────────────────────────────────────────────────────
export interface TypingUser {
  userId: number;
  displayName: string;
}

// ─── Store state & actions ────────────────────────────────────────────────────
interface ChatState {
  conversations: ConversationSummary[];
  messagesMap: Record<number, MessageDto[]>;
  typingMap: Record<number, TypingUser[]>;
  currentConversationId: number | null;
  searchQuery: string;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  hasMoreMessages: Record<number, boolean>;

  // Actions
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: number) => Promise<void>;
  loadMoreMessages: (conversationId: number) => Promise<void>;
  sendMessage: (conversationId: number, content: string, replyToId?: number) => Promise<void>;
  markAsRead: (conversationId: number) => Promise<void>;
  setCurrentConversation: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  connectWs: () => void;
  disconnectWs: () => void;
  handleWsEvent: (event: import("@/services/wsService").WsEvent) => void;
  // Group member management
  addGroupMember: (conversationId: number, userId: number) => Promise<void>;
  removeGroupMember: (conversationId: number, userId: number) => Promise<void>;
  updateGroupMemberRole: (conversationId: number, userId: number, role: "admin" | "member") => Promise<void>;
}

let wsUnsubscribe: (() => void) | null = null;
let typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  messagesMap: {},
  typingMap: {},
  currentConversationId: null,
  searchQuery: "",
  isLoadingConversations: false,
  isLoadingMessages: false,
  hasMoreMessages: {},

  // ── Load conversations ────────────────────────────────────────────────────
  loadConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const conversations = await chatService.getConversations();
      set({ conversations, isLoadingConversations: false });
    } catch (e) {
      console.error("loadConversations:", e);
      set({ isLoadingConversations: false });
    }
  },

  // ── Load messages for a conversation ─────────────────────────────────────
  loadMessages: async (conversationId) => {
    set({ isLoadingMessages: true });
    try {
      const messages = await chatService.getMessages(conversationId, 50);
      set((s) => ({
        messagesMap: { ...s.messagesMap, [conversationId]: messages },
        isLoadingMessages: false,
        hasMoreMessages: {
          ...s.hasMoreMessages,
          [conversationId]: messages.length >= 50,
        },
      }));
    } catch (e) {
      console.error("loadMessages:", e);
      set({ isLoadingMessages: false });
    }
  },

  // ── Load older messages (infinite scroll) ────────────────────────────────
  loadMoreMessages: async (conversationId) => {
    const state = get();
    const existing = state.messagesMap[conversationId] ?? [];
    if (existing.length === 0) return;
    const firstId = existing[0].id;

    try {
      const older = await chatService.getMessages(conversationId, 50, firstId);
      if (older.length === 0) {
        set((s) => ({
          hasMoreMessages: { ...s.hasMoreMessages, [conversationId]: false },
        }));
        return;
      }
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: [...older, ...(s.messagesMap[conversationId] ?? [])],
        },
        hasMoreMessages: {
          ...s.hasMoreMessages,
          [conversationId]: older.length >= 50,
        },
      }));
    } catch (e) {
      console.error("loadMoreMessages:", e);
    }
  },

  // ── Send message ──────────────────────────────────────────────────────────
  sendMessage: async (conversationId, content, replyToId) => {
    const currentUserId = useAuthStore.getState().user?.id ?? 1;

    // Optimistic update
    const tempId = -Date.now();
    const tempMsg: MessageDto = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      senderName: useAuthStore.getState().user?.displayName ?? "Moi",
      senderAvatar: null,
      content,
      messageType: "text",
      replyToId: replyToId ?? null,
      replyToContent: null,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      status: "sending",
      attachments: [],
    };

    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: [...(s.messagesMap[conversationId] ?? []), tempMsg],
      },
    }));

    // Update last message in conversation list
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content, lastMessageAt: new Date().toISOString() }
          : c
      ),
    }));

    try {
      const sent = await chatService.sendMessage(conversationId, content, "text", replyToId);

      // Replace temp message with real one
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
            m.id === tempId ? sent : m
          ),
        },
      }));

      // Simulate delivery/read receipts for own messages
      wsService.simulateReceipts(conversationId, sent.id);

      // Simulate a reply from the other participant (in mock mode)
      const autoReply = AUTO_REPLIES[conversationId];
      if (autoReply) {
        const replies = autoReply.replies;
        const replyContent = replies[Math.floor(Math.random() * replies.length)];
        const delay = 2000 + Math.random() * 3000;

        setTimeout(() => {
          wsService.simulateTyping(conversationId, autoReply.userId, autoReply.name, delay - 500);
        }, 500);

        wsService.simulateResponse(
          conversationId,
          autoReply.userId,
          autoReply.name,
          replyContent,
          delay
        );
      }
    } catch (e) {
      // Mark as failed
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
            m.id === tempId ? { ...m, status: "sent" } : m
          ),
        },
      }));
    }
  },

  // ── Mark as read ──────────────────────────────────────────────────────────
  markAsRead: async (conversationId) => {
    const currentUserId = useAuthStore.getState().user?.id ?? 1;
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
    await chatService.markAsRead(conversationId);

    set((s) => {
      const msgs = s.messagesMap[conversationId] ?? [];
      return {
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: msgs.map((m) =>
            m.senderId !== currentUserId ? { ...m, status: "read" } : m
          ),
        },
      };
    });
  },

  // ── Group member management ───────────────────────────────────────────────
  addGroupMember: async (conversationId, userId) => {
    await chatService.addGroupMember(conversationId, userId);
    // Reload the updated conversation from the service
    const updatedConvs = await chatService.getConversations();
    set({ conversations: updatedConvs });
  },

  removeGroupMember: async (conversationId, userId) => {
    await chatService.removeGroupMember(conversationId, userId);
    const updatedConvs = await chatService.getConversations();
    set({ conversations: updatedConvs });
  },

  updateGroupMemberRole: async (conversationId, userId, role) => {
    await chatService.updateGroupMemberRole(conversationId, userId, role);
    // Update locally in store as well
    set((s) => ({
      conversations: s.conversations.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          participants: conv.participants.map((p) =>
            p.userId === userId ? { ...p, role } : p
          ),
        };
      }),
    }));
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  setCurrentConversation: (id) => {
    set({ currentConversationId: id });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  // ── WebSocket lifecycle ───────────────────────────────────────────────────
  connectWs: () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    if (wsUnsubscribe) wsUnsubscribe();
    wsUnsubscribe = wsService.on((event) => get().handleWsEvent(event));
    wsService.connect(token);
  },

  disconnectWs: () => {
    if (wsUnsubscribe) { wsUnsubscribe(); wsUnsubscribe = null; }
    wsService.disconnect();
  },

  // ── Handle WebSocket events ───────────────────────────────────────────────
  handleWsEvent: (event) => {
    switch (event.type) {
      case "new_message": {
        const convId = event.conversation_id;
        const raw = event.message;
        const msg: MessageDto = {
          id: raw.id,
          conversationId: raw.conversation_id ?? raw.conversationId ?? convId,
          senderId: raw.sender_id ?? raw.senderId ?? null,
          senderName: raw.sender_name ?? raw.senderName ?? null,
          senderAvatar: raw.sender_avatar ?? raw.senderAvatar ?? null,
          content: raw.content ?? null,
          messageType: raw.message_type ?? raw.messageType ?? "text",
          replyToId: raw.reply_to_id ?? raw.replyToId ?? null,
          replyToContent: raw.reply_to_content ?? raw.replyToContent ?? null,
          isEdited: raw.is_edited ?? raw.isEdited ?? false,
          isDeleted: raw.is_deleted ?? raw.isDeleted ?? false,
          createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
          status: raw.status ?? "sent",
          attachments: raw.attachments ?? [],
        };

        // Persist incoming message to the mock DB
        chatService.mockAppendMessage(msg);

        const currentUserId = useAuthStore.getState().user?.id ?? 1;
        const isOwn = msg.senderId === currentUserId;

        set((s) => {
          const existing = s.messagesMap[convId] ?? [];
          if (existing.some((m) => m.id === msg.id)) return s;

          const isActive = s.currentConversationId === convId;
          const conversations = s.conversations.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              lastMessage: msg.content ?? c.lastMessage,
              lastMessageAt: msg.createdAt,
              unreadCount: isOwn || isActive ? 0 : c.unreadCount + 1,
            };
          });

          return {
            messagesMap: { ...s.messagesMap, [convId]: [...existing, msg] },
            conversations,
          };
        });

        const s = get();
        if (s.currentConversationId === convId && !isOwn) {
          chatService.markAsRead(convId).catch(() => {});
        }

        if (!isOwn && s.currentConversationId !== convId) {
          const conv = s.conversations.find((c) => c.id === convId);
          if (conv) {
            useNotificationStore.getState().addNotification({
              conversationId: convId,
              conversationName: conv.name,
              senderName: msg.senderName ?? "Inconnu",
              content: msg.content ?? "(message)",
              createdAt: msg.createdAt,
              isPriority: msg.messageType === "priority",
            });
          }
        }
        break;
      }

      case "message_status": {
        const { conversation_id, message_id, status } = event;
        // Persist status change to mock DB
        chatService.mockUpdateMessageStatus(conversation_id, message_id, status as MessageDto["status"]);
        set((s) => {
          const msgs = s.messagesMap[conversation_id];
          if (!msgs) return s;
          const updated = msgs.map((m) => {
            if (message_id === 0 || m.id === message_id) {
              const currentUserId = useAuthStore.getState().user?.id ?? 1;
              if (m.senderId === currentUserId) {
                return { ...m, status: status as MessageDto["status"] };
              }
            }
            return m;
          });
          return { messagesMap: { ...s.messagesMap, [conversation_id]: updated } };
        });
        break;
      }

      case "typing": {
        const { conversation_id, user_id, display_name, is_typing } = event;
        const key = `${conversation_id}-${user_id}`;

        if (is_typing) {
          set((s) => {
            const current = s.typingMap[conversation_id] ?? [];
            const exists = current.some((u) => u.userId === user_id);
            if (exists) return s;
            return {
              typingMap: {
                ...s.typingMap,
                [conversation_id]: [...current, { userId: user_id, displayName: display_name }],
              },
            };
          });

          if (typingTimers[key]) clearTimeout(typingTimers[key]);
          typingTimers[key] = setTimeout(() => {
            set((s) => ({
              typingMap: {
                ...s.typingMap,
                [conversation_id]: (s.typingMap[conversation_id] ?? []).filter(
                  (u) => u.userId !== user_id
                ),
              },
            }));
          }, 5000);
        } else {
          if (typingTimers[key]) clearTimeout(typingTimers[key]);
          set((s) => ({
            typingMap: {
              ...s.typingMap,
              [conversation_id]: (s.typingMap[conversation_id] ?? []).filter(
                (u) => u.userId !== user_id
              ),
            },
          }));
        }
        break;
      }

      case "presence": {
        const { user_id, status } = event;
        set((s) => ({
          conversations: s.conversations.map((conv) => ({
            ...conv,
            participants: conv.participants.map((p) =>
              p.userId === user_id ? { ...p, presenceStatus: status as any } : p
            ),
          })),
        }));
        break;
      }
    }
  },
}));
