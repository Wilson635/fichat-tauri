import { create } from "zustand";
import { chatService, isTauri, ConversationSummary, MessageDto, mapMessage } from "@/services/chatService";
import { wsService } from "@/services/wsService";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";

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

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: number) => Promise<void>;
  loadMoreMessages: (conversationId: number) => Promise<void>;
  sendMessage: (conversationId: number, content: string, replyToId?: number) => Promise<void>;
  sendFileMessage: (conversationId: number, content: string, file: File, thumbnail: string | null, dataUrl: string, replyToId?: number, messageType?: MessageDto["messageType"]) => Promise<void>;
  markAsRead: (conversationId: number) => Promise<void>;
  setCurrentConversation: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  connectWs: () => void;
  disconnectWs: () => void;
  handleWsEvent: (event: import("@/services/wsService").WsEvent) => void;
  editMessage: (conversationId: number, messageId: number, newContent: string) => Promise<void>;
  deleteMessage: (conversationId: number, messageId: number) => Promise<void>;
  addGroupMember: (conversationId: number, userId: number) => Promise<void>;
  removeGroupMember: (conversationId: number, userId: number) => Promise<void>;
  updateGroupMemberRole: (conversationId: number, userId: number, role: "admin" | "member") => Promise<void>;
  updateGroup: (conversationId: number, name: string, description: string, avatarPath: string | null) => Promise<void>;
  requestOrgGroupJoin: (conversationId: number) => Promise<void>;
}

let wsUnsubscribe: (() => void) | null = null;
let typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** True when `local` is an optimistic temp that corresponds to `incoming`. */
function isPendingMatch(local: MessageDto, incoming: MessageDto): boolean {
  if (local.id >= 0) return false;
  if (local.senderId !== incoming.senderId) return false;
  if (local.conversationId !== incoming.conversationId) return false;
  if (local.messageType !== incoming.messageType) return false;
  if ((local.replyToId ?? null) !== (incoming.replyToId ?? null)) return false;
  if (local.messageType === "text" || local.messageType === "system") {
    return (local.content ?? "") === (incoming.content ?? "");
  }
  const localFile = local.attachments[0]?.fileName ?? "";
  const incomingFile = incoming.attachments[0]?.fileName ?? "";
  if (localFile && incomingFile) return localFile === incomingFile;
  return (local.content ?? "") === (incoming.content ?? "");
}

/**
 * Insert or replace a message without duplicating the optimistic bubble
 * when the HTTP response and the WebSocket echo both arrive.
 */
function upsertMessage(
  existing: MessageDto[],
  incoming: MessageDto,
  replaceTempId?: number,
): MessageDto[] {
  const result: MessageDto[] = [];
  let placed = false;

  for (const m of existing) {
    if (m.id === incoming.id) {
      if (!placed) {
        result.push({ ...m, ...incoming, attachments: incoming.attachments?.length ? incoming.attachments : m.attachments });
        placed = true;
      }
      continue;
    }
    const isTempToReplace =
      !placed &&
      (m.id === replaceTempId || isPendingMatch(m, incoming));
    if (isTempToReplace) {
      result.push(incoming);
      placed = true;
      continue;
    }
    result.push(m);
  }

  if (!placed) result.push(incoming);
  return result;
}

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

    // Optimistic update with temp id
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
      conversations: s.conversations.map((c) =>
          c.id === conversationId
              ? { ...c, lastMessage: content, lastMessageAt: new Date().toISOString() }
              : c
      ),
    }));

    try {
      const sent = await chatService.sendMessage(conversationId, content, "text", replyToId);

      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: upsertMessage(s.messagesMap[conversationId] ?? [], sent, tempId),
        },
      }));

      // In web (mock) mode: broadcast to other tabs + simulate receipts
      if (!isTauri()) {
        // ── Broadcast to other browser tabs (cross-user real-time) ──────────
        wsService.broadcastEvent({
          type: "new_message",
          conversation_id: conversationId,
          message: {
            id: sent.id,
            conversation_id: conversationId,
            conversationId,
            sender_id: sent.senderId,
            senderId: sent.senderId,
            sender_name: sent.senderName,
            senderName: sent.senderName,
            sender_avatar: sent.senderAvatar,
            senderAvatar: sent.senderAvatar,
            content: sent.content,
            message_type: sent.messageType,
            messageType: sent.messageType,
            reply_to_id: sent.replyToId,
            replyToId: sent.replyToId,
            reply_to_content: sent.replyToContent,
            replyToContent: sent.replyToContent,
            is_edited: sent.isEdited,
            isEdited: sent.isEdited,
            is_deleted: sent.isDeleted,
            isDeleted: sent.isDeleted,
            created_at: sent.createdAt,
            createdAt: sent.createdAt,
            status: sent.status,
            attachments: sent.attachments,
          },
        });

        wsService.simulateReceipts(conversationId, sent.id);
      }
    } catch (e) {
      console.error("sendMessage error:", e);
      // Mark temp message as failed
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
              m.id === tempId ? { ...m, status: "sent" as const } : m
          ),
        },
      }));
    }
  },

  // ── Send file message ────────────────────────────────────────────────────
  sendFileMessage: async (conversationId, content, file, thumbnail, dataUrl, replyToId, messageType) => {
    const currentUserId = useAuthStore.getState().user?.id ?? 1;
    const tempId = -Date.now();

    const resolvedType: MessageDto["messageType"] =
        messageType ??
        (file.type.startsWith("image/")
            ? "image"
            : file.name.startsWith("message-vocal")
                ? "voice"
                : file.type.startsWith("video/")
                    ? "video"
                    : "file");

    const tempAtt = {
      id: tempId,
      fileName: file.name,
      filePath: dataUrl,
      fileType: file.type || null,
      fileSize: file.size,
      thumbnail: thumbnail ?? (file.type.startsWith("image/") ? dataUrl : null),
    };
    const lastPreview =
        resolvedType === "voice" ? "🎤 Message vocal" : content || `📎 ${file.name}`;
    const tempMsg: MessageDto = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      senderName: useAuthStore.getState().user?.displayName ?? "Moi",
      senderAvatar: null,
      content: content || null,
      messageType: resolvedType,
      replyToId: replyToId ?? null,
      replyToContent: null,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      status: "sending",
      attachments: [tempAtt],
    };

    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: [...(s.messagesMap[conversationId] ?? []), tempMsg],
      },
      conversations: s.conversations.map((c) =>
          c.id === conversationId
              ? { ...c, lastMessage: lastPreview, lastMessageAt: new Date().toISOString() }
              : c
      ),
    }));

    try {
      const sent = await chatService.sendFileMessage(
          conversationId, content, file, thumbnail, dataUrl, replyToId, resolvedType,
      );
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: upsertMessage(s.messagesMap[conversationId] ?? [], sent, tempId),
        },
      }));

      if (!isTauri()) {
        wsService.broadcastEvent({
          type: "new_message",
          conversation_id: conversationId,
          message: {
            id: sent.id,
            conversation_id: conversationId,
            conversationId,
            sender_id: sent.senderId,
            senderId: sent.senderId,
            sender_name: sent.senderName,
            senderName: sent.senderName,
            sender_avatar: sent.senderAvatar,
            senderAvatar: sent.senderAvatar,
            content: sent.content,
            message_type: sent.messageType,
            messageType: sent.messageType,
            reply_to_id: sent.replyToId,
            replyToId: sent.replyToId,
            reply_to_content: sent.replyToContent,
            replyToContent: sent.replyToContent,
            is_edited: sent.isEdited,
            isEdited: sent.isEdited,
            is_deleted: sent.isDeleted,
            isDeleted: sent.isDeleted,
            created_at: sent.createdAt,
            createdAt: sent.createdAt,
            status: sent.status,
            attachments: sent.attachments,
          },
        });
        wsService.simulateReceipts(conversationId, sent.id);
      }
    } catch (e) {
      console.error("sendFileMessage error:", e);
      set((s) => ({
        messagesMap: {
          ...s.messagesMap,
          [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
              m.id === tempId ? { ...m, status: "sent" as const } : m
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
              m.senderId !== currentUserId ? { ...m, status: "read" as const } : m
          ),
        },
      };
    });
  },

  // ── Edit message ──────────────────────────────────────────────────────────
  editMessage: async (conversationId: number, messageId: number, newContent: string) => {
    // Optimistic update
    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
            m.id === messageId ? { ...m, content: newContent, isEdited: true } : m
        ),
      },
    }));
    try {
      await chatService.editMessage(conversationId, messageId, newContent);
    } catch (e) {
      console.error("editMessage error:", e);
    }
  },

  // ── Delete message ────────────────────────────────────────────────────────
  deleteMessage: async (conversationId: number, messageId: number) => {
    // Optimistic update
    set((s) => ({
      messagesMap: {
        ...s.messagesMap,
        [conversationId]: (s.messagesMap[conversationId] ?? []).map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, content: null, attachments: [] } : m
        ),
      },
    }));
    try {
      await chatService.deleteMessage(conversationId, messageId);
    } catch (e) {
      console.error("deleteMessage error:", e);
    }
  },

  // ── Group member management ───────────────────────────────────────────────
  addGroupMember: async (conversationId, userId) => {
    await chatService.addGroupMember(conversationId, userId);
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

  updateGroup: async (conversationId, name, description, avatarPath) => {
    const updated = await chatService.updateGroup(conversationId, name, description, avatarPath);
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, name: updated.name, description: updated.description, avatarPath: updated.avatarPath }
          : c
      ),
    }));
  },

  requestOrgGroupJoin: async (conversationId) => {
    const status = await chatService.requestOrgGroupJoin(conversationId);
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, membership: status } : c
      ),
    }));
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  setCurrentConversation: (id) => set({ currentConversationId: id }),
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
      case "auth_ok": {
        void get().loadConversations().then(() => {
          const activeCid = get().currentConversationId;
          const conv = get().conversations.find((c) => c.id === activeCid);
          const locked = conv?.membership === "none" || conv?.membership === "pending";
          if (activeCid && !locked) {
            void get().loadMessages(activeCid);
          }
        });
        break;
      }

      case "new_message": {
        const convId = event.conversation_id;
        const raw = event.message ?? {};
        const msg: MessageDto = mapMessage({
          ...raw,
          conversation_id: raw.conversation_id ?? raw.conversationId ?? convId,
        });

        // In web (mock) mode, persist incoming message to localStorage
        if (!isTauri()) {
          chatService.mockAppendMessage(msg);
        }

        const currentUserId = useAuthStore.getState().user?.id ?? 1;
        const isOwn = msg.senderId === currentUserId;

        set((s) => {
          const existing = s.messagesMap[convId] ?? [];
          const alreadyHad = existing.some((m) => m.id === msg.id);
          const merged = upsertMessage(existing, msg);

          if (alreadyHad && (msg.isEdited || msg.isDeleted)) {
            return {
              ...s,
              messagesMap: { ...s.messagesMap, [convId]: merged },
            };
          }

          if (alreadyHad || merged.length === existing.length) {
            return {
              ...s,
              messagesMap: { ...s.messagesMap, [convId]: merged },
            };
          }

          const isActive = s.currentConversationId === convId;
          const conversations = s.conversations.map((c) => {
            if (c.id !== convId) return c;
            const last =
              msg.messageType === "voice"
                ? "🎤 Message vocal"
                : msg.content ||
                  (msg.attachments?.[0] ? `📎 ${msg.attachments[0].fileName}` : c.lastMessage);
            return {
              ...c,
              lastMessage: last,
              lastMessageAt: msg.createdAt,
              unreadCount: isOwn || isActive ? 0 : c.unreadCount + 1,
            };
          });

          return {
            messagesMap: { ...s.messagesMap, [convId]: merged },
            conversations,
          };
        });

        const s = get();
        if (s.currentConversationId === convId && !isOwn) {
          chatService.markAsRead(convId).catch(() => {});
        }

        if (!isOwn) {
          // Notifier si :
          //   • User B n'est pas dans cette conversation, OU
          //   • La fenêtre Tauri n'a pas le focus (app en arrière-plan / minimisée)
          const windowFocused = typeof document !== "undefined" && document.hasFocus();
          const inActiveConv = s.currentConversationId === convId;
          const shouldNotify = !inActiveConv || !windowFocused;

          if (shouldNotify) {
            // Cherche la conv dans le store ; si absente, utilise un nom générique
            const conv = s.conversations.find((c) => c.id === convId);
            const convName = conv?.name ?? `Conversation #${convId}`;
            const preview =
              msg.messageType === "voice"
                ? "🎤 Message vocal"
                : msg.content ||
                  (msg.attachments?.[0] ? `📎 ${msg.attachments[0].fileName}` : "(message)");
            useNotificationStore.getState().addNotification({
              conversationId: convId,
              conversationName: convName,
              senderName: msg.senderName ?? "Inconnu",
              content: preview,
              createdAt: msg.createdAt,
              isPriority: false,
            });
          }
        }
        break;
      }

      case "message_status": {
        const { conversation_id, message_id, status } = event;
        // In web (mock) mode, persist status change to localStorage
        if (!isTauri()) {
          chatService.mockUpdateMessageStatus(conversation_id, message_id, status as MessageDto["status"]);
        }
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
