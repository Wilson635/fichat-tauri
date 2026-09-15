/**
 * Chat service — wraps Tauri invoke calls for chat.
 * In web mode (no Tauri) delegates to the localStorage-backed mockDb.
 */

import { useAuthStore } from "@/store/authStore";
import {
  SYSTEM_USERS,
  dbLoadConversations,
  dbAddConversation,
  dbUpdateConversation,
  dbAddGroupMember,
  dbRemoveGroupMember,
  dbUpdateGroupMemberRole,
  dbGetMessages,
  dbAddMessage,
  dbUpdateMessageStatus,
  dbInitConvMessages,
  nextId,
  getUserById,
} from "./mockDb";

// ─── Invoke helper ────────────────────────────────────────────────────────────
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserForChat {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  avatarPath: string | null;
  presenceStatus: string;
}

export interface ParticipantInfo {
  userId: number;
  displayName: string;
  avatarPath: string | null;
  presenceStatus: "online" | "away" | "busy" | "offline";
  role?: "admin" | "member";
}

export interface ConversationSummary {
  id: number;
  convType: "direct" | "group";
  name: string;
  avatarPath: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  participants: ParticipantInfo[];
}

export interface AttachmentDto {
  id: number;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  thumbnail: string | null;
}

export interface MessageDto {
  id: number;
  conversationId: number;
  senderId: number | null;
  senderName: string | null;
  senderAvatar: string | null;
  content: string | null;
  messageType: "text" | "image" | "file" | "system";
  replyToId: number | null;
  replyToContent: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  status: "sending" | "sent" | "delivered" | "read";
  attachments: AttachmentDto[];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapConversation(raw: any): ConversationSummary {
  return {
    id: raw.id,
    convType: raw.conv_type ?? raw.convType,
    name: raw.name,
    avatarPath: raw.avatar_path ?? raw.avatarPath ?? null,
    lastMessage: raw.last_message ?? raw.lastMessage ?? null,
    lastMessageAt: raw.last_message_at ?? raw.lastMessageAt ?? null,
    unreadCount: raw.unread_count ?? raw.unreadCount ?? 0,
    participants: (raw.participants ?? []).map((p: any) => ({
      userId: p.user_id ?? p.userId,
      displayName: p.display_name ?? p.displayName,
      avatarPath: p.avatar_path ?? p.avatarPath ?? null,
      presenceStatus: p.presence_status ?? p.presenceStatus ?? "offline",
      role: p.role ?? "member",
    })),
  };
}

function mapMessage(raw: any): MessageDto {
  return {
    id: raw.id,
    conversationId: raw.conversation_id ?? raw.conversationId,
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
    attachments: (raw.attachments ?? []).map((a: any) => ({
      id: a.id,
      fileName: a.file_name ?? a.fileName,
      filePath: a.file_path ?? a.filePath,
      fileType: a.file_type ?? a.fileType ?? null,
      fileSize: a.file_size ?? a.fileSize ?? null,
      thumbnail: a.thumbnail ?? null,
    })),
  };
}

function currentUid(): number {
  return useAuthStore.getState().user?.id ?? 1;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const chatService = {

  async getConversations(): Promise<ConversationSummary[]> {
    if (!isTauri()) {
      return dbLoadConversations(currentUid());
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_get_conversations", { token });
    return raw.map(mapConversation);
  },

  async getMessages(conversationId: number, limit = 50, beforeId?: number): Promise<MessageDto[]> {
    if (!isTauri()) {
      const msgs = dbGetMessages(currentUid(), conversationId);
      if (beforeId !== undefined) {
        const idx = msgs.findIndex((m) => m.id === beforeId);
        if (idx === -1) return [];
        return msgs.slice(Math.max(0, idx - limit), idx);
      }
      return msgs.slice(-limit);
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_get_messages", {
      token, conversationId, limit, beforeId: beforeId ?? null,
    });
    return raw.map(mapMessage);
  },

  async sendMessage(
    conversationId: number,
    content: string,
    messageType: "text" | "image" | "file" = "text",
    replyToId?: number,
  ): Promise<MessageDto> {
    if (!isTauri()) {
      const uid = currentUid();
      const newMsg: MessageDto = {
        id: nextId(),
        conversationId,
        senderId: uid,
        senderName: null,
        senderAvatar: null,
        content,
        messageType,
        replyToId: replyToId ?? null,
        replyToContent: null,
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        status: "sent",
        attachments: [],
      };
      dbAddMessage(uid, newMsg);
      dbUpdateConversation(uid, conversationId, {
        lastMessage: content,
        lastMessageAt: newMsg.createdAt,
      });
      return newMsg;
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any>("cmd_send_message", {
      token, conversationId, content, messageType, replyToId: replyToId ?? null,
    });
    return mapMessage(raw);
  },

  async markAsRead(conversationId: number): Promise<void> {
    if (!isTauri()) {
      dbUpdateConversation(currentUid(), conversationId, { unreadCount: 0 });
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_mark_as_read", { token, conversationId });
  },

  async searchMessages(conversationId: number, query: string): Promise<MessageDto[]> {
    if (!isTauri()) {
      const q = query.toLowerCase();
      return dbGetMessages(currentUid(), conversationId).filter(
        (m) => m.content?.toLowerCase().includes(q),
      );
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_search_messages", { token, conversationId, query });
    return raw.map(mapMessage);
  },

  async listUsers(): Promise<UserForChat[]> {
    if (!isTauri()) {
      return SYSTEM_USERS;
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_list_users", { token });
    return raw.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name ?? u.displayName,
      email: u.email ?? null,
      department: u.department ?? null,
      avatarPath: u.avatar_path ?? u.avatarPath ?? null,
      presenceStatus: u.presence_status ?? u.presenceStatus ?? "offline",
    }));
  },

  async createDirectConversation(otherUserId: number): Promise<number> {
    if (!isTauri()) {
      const uid = currentUid();
      const convs = dbLoadConversations(uid);
      const existing = convs.find(
        (c) => c.convType === "direct" && c.participants.some((p) => p.userId === otherUserId),
      );
      if (existing) return existing.id;

      const other = getUserById(otherUserId);
      const convId = nextId();
      const newConv: ConversationSummary = {
        id: convId,
        convType: "direct",
        name: other?.displayName ?? `User ${otherUserId}`,
        avatarPath: null,
        lastMessage: null,
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        participants: [
          { userId: uid, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
          {
            userId: otherUserId,
            displayName: other?.displayName ?? `User ${otherUserId}`,
            avatarPath: null,
            presenceStatus: (other?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
          },
        ],
      };
      dbAddConversation(uid, newConv);
      dbInitConvMessages(uid, convId);
      return convId;
    }
    const token = useAuthStore.getState().token!;
    const safeId = Math.trunc(otherUserId);
    if (!safeId || safeId <= 0) throw new Error(`ID utilisateur invalide : ${otherUserId}`);
    return invoke<number>("cmd_create_direct_conversation", { token, otherUserId: safeId });
  },

  async createGroupConversation(name: string, description: string, memberIds: number[]): Promise<number> {
    if (!isTauri()) {
      const uid = currentUid();
      const convId = nextId();

      const participants: ParticipantInfo[] = [
        { userId: uid, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        ...memberIds.map((mid) => {
          const u = getUserById(mid);
          return {
            userId: mid,
            displayName: u?.displayName ?? `User ${mid}`,
            avatarPath: null,
            presenceStatus: (u?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
          };
        }),
      ];

      const newConv: ConversationSummary = {
        id: convId,
        convType: "group",
        name,
        avatarPath: null,
        lastMessage: null,
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        participants,
      };
      dbAddConversation(uid, newConv);
      dbInitConvMessages(uid, convId);
      return convId;
    }
    const token = useAuthStore.getState().token!;
    return invoke<number>("cmd_create_group_conversation", { token, name, description, memberIds });
  },

  async addGroupMember(conversationId: number, userId: number): Promise<void> {
    if (!isTauri()) {
      const uid = currentUid();
      const u = getUserById(userId);
      const member: ParticipantInfo = {
        userId,
        displayName: u?.displayName ?? `User ${userId}`,
        avatarPath: null,
        presenceStatus: (u?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
      };
      dbAddGroupMember(uid, conversationId, member);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_add_group_member", { token, conversationId, userId });
  },

  async removeGroupMember(conversationId: number, userId: number): Promise<void> {
    if (!isTauri()) {
      dbRemoveGroupMember(currentUid(), conversationId, userId);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_remove_group_member", { token, conversationId, userId });
  },

  async updateGroupMemberRole(conversationId: number, userId: number, role: "admin" | "member"): Promise<void> {
    if (!isTauri()) {
      dbUpdateGroupMemberRole(currentUid(), conversationId, userId, role);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_update_member_role", { token, conversationId, userId, role });
  },

  /** Used by wsService in mock mode to update message status in DB */
  mockUpdateMessageStatus(conversationId: number, messageId: number, status: MessageDto["status"]): void {
    dbUpdateMessageStatus(currentUid(), conversationId, messageId, status);
  },

  /** Used by wsService in mock mode to append an incoming message to the DB */
  mockAppendMessage(msg: MessageDto): void {
    dbAddMessage(currentUid(), msg);
  },
};
