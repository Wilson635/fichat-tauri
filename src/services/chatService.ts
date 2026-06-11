/**
 * Chat service — wraps Tauri invoke calls for chat.
 * En mode web (pas de Tauri) délègue au mockDb localStorage.
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
  dbEditMessage,
  dbDeleteMessage,
  dbInitConvMessages,
  nextId,
  getUserById,
} from "./mockDb";

// ─── Tauri detection ──────────────────────────────────────────────────────────

export const isTauri = (): boolean =>
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Tauri invoke helper ──────────────────────────────────────────────────────

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// ─── Media item type ─────────────────────────────────────────────────────────

export interface MediaItem {
  id: number;
  messageId: number;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  thumbnail: string | null;
  senderName: string | null;
  createdAt: string;
}

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
  createdByName?: string | null;
}

export interface MessageSearchResult {
  message: MessageDto;
  conversation: ConversationSummary;
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

// ─── Mappers (snake_case → camelCase) ─────────────────────────────────────────

function mapConversation(raw: any): ConversationSummary {
  return {
    id: Number(raw.id ?? raw.id),
    convType: raw.conv_type ?? raw.convType,
    name: raw.name,
    avatarPath: raw.avatar_path ?? raw.avatarPath ?? null,
    lastMessage: raw.last_message ?? raw.lastMessage ?? null,
    lastMessageAt: raw.last_message_at ?? raw.lastMessageAt ?? null,
    unreadCount: Number(raw.unread_count ?? raw.unreadCount ?? 0),
    participants: (raw.participants ?? []).map((p: any) => ({
      userId: Number(p.user_id ?? p.userId),
      displayName: p.display_name ?? p.displayName,
      avatarPath: p.avatar_path ?? p.avatarPath ?? null,
      presenceStatus: p.presence_status ?? p.presenceStatus ?? "offline",
      role: (p.role ?? "member") as "admin" | "member",
    })),
    createdByName: raw.created_by_name ?? raw.createdByName ?? null,
  };
}

export function mapMessage(raw: any): MessageDto {
  return {
    id: Number(raw.id),
    conversationId: Number(raw.conversation_id ?? raw.conversationId),
    senderId: raw.sender_id != null ? Number(raw.sender_id ?? raw.senderId) : null,
    senderName: raw.sender_name ?? raw.senderName ?? null,
    senderAvatar: raw.sender_avatar ?? raw.senderAvatar ?? null,
    content: raw.content ?? null,
    messageType: raw.message_type ?? raw.messageType ?? "text",
    replyToId: raw.reply_to_id != null ? Number(raw.reply_to_id ?? raw.replyToId) : null,
    replyToContent: raw.reply_to_content ?? raw.replyToContent ?? null,
    isEdited: raw.is_edited ?? raw.isEdited ?? false,
    isDeleted: raw.is_deleted ?? raw.isDeleted ?? false,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    status: raw.status ?? "sent",
    attachments: (raw.attachments ?? []).map((a: any) => ({
      id: Number(a.id),
      fileName: a.file_name ?? a.fileName,
      filePath: a.file_path ?? a.filePath,
      fileType: a.file_type ?? a.fileType ?? null,
      fileSize: a.file_size != null ? Number(a.file_size ?? a.fileSize) : null,
      thumbnail: a.thumbnail ?? null,
    })),
  };
}

function currentUid(): number {
  return useAuthStore.getState().user?.id ?? 1;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const chatService = {

  // ── Conversations ───────────────────────────────────────────────────────────

  async getConversations(): Promise<ConversationSummary[]> {
    if (!isTauri()) {
      return dbLoadConversations(currentUid());
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_get_conversations", { token });
    return raw.map(mapConversation);
  },

  // ── Messages ────────────────────────────────────────────────────────────────

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
      token,
      conversationId,
      limit,
      beforeId: beforeId ?? null,
    });
    return raw.map(mapMessage);
  },

  // ── Send message ─────────────────────────────────────────────────────────────

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
      token,
      conversationId,
      content,
      messageType,
      replyToId: replyToId ?? null,
    });
    return mapMessage(raw);
  },

  // ── Edit message ─────────────────────────────────────────────────────────────

  async editMessage(conversationId: number, messageId: number, newContent: string): Promise<void> {
    if (!isTauri()) {
      dbEditMessage(currentUid(), conversationId, messageId, newContent);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_edit_message", { token, messageId, content: newContent });
  },

  // ── Delete message ────────────────────────────────────────────────────────────

  async deleteMessage(conversationId: number, messageId: number): Promise<void> {
    if (!isTauri()) {
      dbDeleteMessage(currentUid(), conversationId, messageId);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_delete_message", { token, messageId });
  },

  // ── Mark as read ─────────────────────────────────────────────────────────────

  async markAsRead(conversationId: number): Promise<void> {
    if (!isTauri()) {
      dbUpdateConversation(currentUid(), conversationId, { unreadCount: 0 });
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_mark_as_read", { token, conversationId });
  },

  // ── Search ──────────────────────────────────────────────────────────────────

  async searchAllMessages(query: string, conversations: ConversationSummary[]): Promise<MessageSearchResult[]> {
    if (!isTauri()) {
      const uid = currentUid();
      const q = query.toLowerCase().trim();
      if (!q) return [];
      const results: MessageSearchResult[] = [];
      for (const conv of conversations) {
        const msgs = dbGetMessages(uid, conv.id);
        for (const m of msgs) {
          if (m.content?.toLowerCase().includes(q)) {
            results.push({ message: m, conversation: conv });
          }
        }
      }
      results.sort((a, b) =>
          new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime()
      );
      return results.slice(0, 50);
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_search_all_messages", { token, query });
    return raw.map((r) => ({
      message: mapMessage(r.message),
      conversation: mapConversation(r.conversation),
    }));
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

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(): Promise<UserForChat[]> {
    if (!isTauri()) {
      return SYSTEM_USERS;
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_list_users", { token });
    return raw.map((u) => ({
      id: Number(u.id),
      username: u.username,
      displayName: u.display_name ?? u.displayName,
      email: u.email ?? null,
      department: u.department ?? null,
      avatarPath: u.avatar_path ?? u.avatarPath ?? null,
      presenceStatus: u.presence_status ?? u.presenceStatus ?? "offline",
    }));
  },

  // ── Create conversations ──────────────────────────────────────────────────────

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
    return Number(await invoke<number>("cmd_create_direct_conversation", { token, otherUserId: safeId }));
  },

  async createGroupConversation(name: string, description: string, memberIds: number[]): Promise<number> {
    if (!isTauri()) {
      const uid = currentUid();
      const convId = nextId();
      const participants: ParticipantInfo[] = [
        { userId: uid, displayName: "Moi", avatarPath: null, presenceStatus: "online", role: "admin" },
        ...memberIds.map((mid) => {
          const u = getUserById(mid);
          return {
            userId: mid,
            displayName: u?.displayName ?? `User ${mid}`,
            avatarPath: null,
            presenceStatus: (u?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
            role: "member" as "admin" | "member",
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
    return Number(await invoke<number>("cmd_create_group_conversation", { token, name, description, memberIds }));
  },

  // ── Group member management ──────────────────────────────────────────────────

  async addGroupMember(conversationId: number, userId: number): Promise<void> {
    if (!isTauri()) {
      const uid = currentUid();
      const u = getUserById(userId);
      const member: ParticipantInfo = {
        userId,
        displayName: u?.displayName ?? `User ${userId}`,
        avatarPath: null,
        presenceStatus: (u?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
        role: "member",
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

  // ── File message ─────────────────────────────────────────────────────────────

  async sendFileMessage(
      conversationId: number,
      content: string,
      file: File,
      thumbnail: string | null,
      dataUrl: string,
      replyToId?: number,
  ): Promise<MessageDto> {
    if (!isTauri()) {
      const uid = currentUid();
      const att: AttachmentDto = {
        id: nextId(),
        fileName: file.name,
        filePath: dataUrl,
        fileType: file.type || null,
        fileSize: file.size,
        thumbnail: thumbnail ?? (file.type.startsWith("image/") ? dataUrl : null),
      };
      const msgType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
      const msg: MessageDto = {
        id: nextId(),
        conversationId,
        senderId: uid,
        senderName: null,
        senderAvatar: null,
        content: content || null,
        messageType: msgType as any,
        replyToId: replyToId ?? null,
        replyToContent: null,
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        status: "sent",
        attachments: [att],
      };
      dbAddMessage(uid, msg);
      dbUpdateConversation(uid, conversationId, {
        lastMessage: content || `📎 ${file.name}`,
        lastMessageAt: msg.createdAt,
      });
      return msg;
    }

    const token = useAuthStore.getState().token!;
    const { fileToBase64 } = await import("@/utils/fileUtils");
    const base64Data = await fileToBase64(file);

    const raw = await invoke<any>("cmd_send_message_with_file", {
      token,
      conversationId,
      content,
      fileName: file.name,
      base64Data,
      thumbnail: thumbnail ?? null,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      replyToId: replyToId ?? null,
    });
    return mapMessage(raw);
  },

  // ── Media gallery ─────────────────────────────────────────────────────────────

  async getConversationMedia(conversationId: number): Promise<MediaItem[]> {
    if (!isTauri()) {
      const uid = currentUid();
      const msgs = dbGetMessages(uid, conversationId);
      const items: MediaItem[] = [];
      for (const msg of msgs) {
        for (const att of msg.attachments ?? []) {
          items.push({
            id: att.id,
            messageId: msg.id,
            fileName: att.fileName,
            filePath: att.filePath,
            fileType: att.fileType,
            fileSize: att.fileSize,
            thumbnail: att.thumbnail,
            senderName: msg.senderName,
            createdAt: msg.createdAt,
          });
        }
      }
      return items.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_get_conversation_media", { token, conversationId });
    return raw.map((r) => ({
      id: Number(r.id),
      messageId: Number(r.message_id ?? r.messageId),
      fileName: r.file_name ?? r.fileName,
      filePath: r.file_path ?? r.filePath,
      fileType: r.file_type ?? r.fileType ?? null,
      fileSize: r.file_size != null ? Number(r.file_size ?? r.fileSize) : null,
      thumbnail: r.thumbnail ?? null,
      senderName: r.sender_name ?? r.senderName ?? null,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    }));
  },

  // ── Get raw file as base64 ────────────────────────────────────────────────────

  async getFileAsBase64(filePath: string): Promise<string> {
    if (!isTauri()) {
      // In web mode, filePath is already a data URL — extract the base64 part
      if (filePath.startsWith("data:")) {
        return filePath.split(",")[1] ?? "";
      }
      return "";
    }
    const token = useAuthStore.getState().token!;
    return invoke<string>("cmd_get_file_as_base64", { token, filePath });
  },

  // ── Mock-only helpers (web mode only — no-ops in Tauri) ──────────────────────

  mockUpdateMessageStatus(conversationId: number, messageId: number, status: MessageDto["status"]): void {
    if (isTauri()) return;
    dbUpdateMessageStatus(currentUid(), conversationId, messageId, status);
  },

  mockAppendMessage(msg: MessageDto): void {
    if (isTauri()) return;
    dbAddMessage(currentUid(), msg);
  },
};
