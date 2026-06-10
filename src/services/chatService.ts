/**
 * Chat service — wraps Tauri invoke calls for chat.
 * Falls back to rich in-memory mock data when running in web preview (no Tauri).
 */

import { useAuthStore } from "@/store/authStore";

// ─── Invoke helper ───────────────────────────────────────────────────────────
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Mock data store (in-memory, persists per session) ───────────────────────
const mockParticipants: Record<number, ParticipantInfo> = {
  2: { userId: 2, displayName: "Alice Martin", avatarPath: null, presenceStatus: "online" },
  3: { userId: 3, displayName: "Bob Dupont", avatarPath: null, presenceStatus: "away" },
  4: { userId: 4, displayName: "Claire Bernard", avatarPath: null, presenceStatus: "busy" },
  5: { userId: 5, displayName: "David Moreau", avatarPath: null, presenceStatus: "online" },
};

let mockNextId = 1000;
function nextId() { return ++mockNextId; }

function makeMsg(
    id: number,
    convId: number,
    senderId: number | null,
    content: string,
    createdAt: Date,
    status: MessageDto["status"] = "read",
    overrides: Partial<MessageDto> = {}
): MessageDto {
  const sender = senderId ? mockParticipants[senderId] : null;
  return {
    id,
    conversationId: convId,
    senderId,
    senderName: sender?.displayName ?? null,
    senderAvatar: null,
    content,
    messageType: "text",
    replyToId: null,
    replyToContent: null,
    isEdited: false,
    isDeleted: false,
    createdAt: createdAt.toISOString(),
    status,
    attachments: [],
    ...overrides,
  };
}

function ago(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}
function daysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Mock message store: convId -> Message[]
const mockMessages: Map<number, MessageDto[]> = new Map();

// Lazy-initialize per conversation with the current user's ID
function initMockMessages(currentUserId: number) {
  if (mockMessages.size > 0) return;

  // Conv 1: DM with Alice (id=2)
  mockMessages.set(1, [
    makeMsg(1,  1, 2,              "Bonjour ! Comment se passe votre journée ?", daysAgo(3, 9, 10)),
    makeMsg(2,  1, currentUserId, "Très bien merci ! Beaucoup de travail en ce moment.", daysAgo(3, 9, 15)),
    makeMsg(3,  1, 2,              "Je comprends. Avez-vous eu le temps de regarder le rapport Q3 ?", daysAgo(3, 9, 30)),
    makeMsg(4,  1, currentUserId, "Pas encore, je le fais ce soir.", daysAgo(3, 9, 32)),
    makeMsg(5,  1, 2,              "Pas de problème, prenez votre temps.", daysAgo(3, 9, 35)),
    makeMsg(6,  1, currentUserId, "Je vous l'envoie mes commentaires demain matin.", daysAgo(2, 8, 5)),
    makeMsg(7,  1, 2,              "Parfait, merci ! À demain.", daysAgo(2, 8, 7)),
    makeMsg(8,  1, 2,              "Bonjour, avez-vous eu le temps de regarder le rapport ?", ago(30), "delivered"),
    makeMsg(9,  1, 2,              "Il y a quelques points importants à discuter en équipe.", ago(28), "sent"),
  ]);

  // Conv 2: Group "Équipe Dev" (Alice + current user + David) (id=3)
  mockMessages.set(2, [
    makeMsg(20, 2, 5,              "La PR pour le module d'auth est prête à reviewer.", daysAgo(1, 14, 0)),
    makeMsg(21, 2, currentUserId, "Je regarde ça dans l'heure.", daysAgo(1, 14, 5)),
    makeMsg(22, 2, 2,              "J'ai laissé quelques commentaires, rien de bloquant.", daysAgo(1, 14, 45)),
    makeMsg(23, 2, 5,              "Merci, je corrige et je repasse en review.", daysAgo(1, 15, 0)),
    makeMsg(24, 2, currentUserId, "La démo est prête pour demain.", ago(120), "delivered"),
    makeMsg(25, 2, 2,              "Super ! On se retrouve en salle Étoile à 14h.", ago(115), "sent"),
    makeMsg(26, 2, 5,              "Je serai là. Qui prépare le slide de présentation ?", ago(60), "sent"),
    makeMsg(27, 2, 2,              "Je m'en charge. 😊", ago(45), "sent"),
    makeMsg(28, 2, 5,              "Excellent, merci Alice !", ago(30), "sent"),
  ]);

  // Conv 3: DM with Bob (id=3)
  mockMessages.set(3, [
    makeMsg(40, 3, currentUserId, "Bob, peux-tu m'envoyer le contrat signé ?", daysAgo(5, 10, 0)),
    makeMsg(41, 3, 3,              "Bien sûr, je te l'envoie aujourd'hui.", daysAgo(5, 10, 15)),
    makeMsg(42, 3, 3,              "C'est fait, regarde ta boite mail.", daysAgo(4, 16, 30)),
    makeMsg(43, 3, currentUserId, "Reçu, merci beaucoup !", daysAgo(4, 16, 35)),
    makeMsg(44, 3, 3,              "Merci pour le document !", ago(240)),
  ]);

  // Conv 4: Group "Direction ACME" (id=4)
  mockMessages.set(4, [
    makeMsg(60, 4, 4,              "Réunion de direction vendredi à 9h.", daysAgo(2, 8, 0)),
    makeMsg(61, 4, currentUserId, "Noté, je serai présent.", daysAgo(2, 8, 10)),
    makeMsg(62, 4, 2,              "Moi aussi.", daysAgo(2, 8, 15)),
    makeMsg(63, 4, 3,              "Je ne pourrai pas, déplacement client.", daysAgo(2, 8, 20)),
    makeMsg(64, 4, 4,              "Réunion demain à 14h — ordre du jour : budget T1 2026.", ago(180)),
  ]);

  // Conv 5: DM with Claire (id=4)
  mockMessages.set(5, [
    makeMsg(80, 5, 4,              "Bonjour, j'ai finalisé le budget prévisionnel.", daysAgo(1, 9, 0)),
    makeMsg(81, 5, currentUserId, "Très bien, je le transmets à la direction.", daysAgo(1, 9, 10)),
    makeMsg(82, 5, 4,              "Le budget a été validé ✓", ago(300)),
    makeMsg(83, 5, currentUserId, "Excellent ! Merci Claire.", ago(290)),
  ]);
}

// Mock conversations (depends on current user ID)
function getMockConversations(currentUserId: number): ConversationSummary[] {
  initMockMessages(currentUserId);

  return [
    {
      id: 1,
      convType: "direct",
      name: "Alice Martin",
      avatarPath: null,
      lastMessage: "Il y a quelques points importants à discuter en équipe.",
      lastMessageAt: ago(28).toISOString(),
      unreadCount: 2,
      participants: [
        { userId: currentUserId, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        mockParticipants[2],
      ],
    },
    {
      id: 2,
      convType: "group",
      name: "Équipe Dev",
      avatarPath: null,
      lastMessage: "Excellent, merci Alice !",
      lastMessageAt: ago(30).toISOString(),
      unreadCount: 3,
      participants: [
        { userId: currentUserId, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        mockParticipants[2],
        mockParticipants[5],
      ],
    },
    {
      id: 3,
      convType: "direct",
      name: "Bob Dupont",
      avatarPath: null,
      lastMessage: "Merci pour le document !",
      lastMessageAt: ago(240).toISOString(),
      unreadCount: 0,
      participants: [
        { userId: currentUserId, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        mockParticipants[3],
      ],
    },
    {
      id: 4,
      convType: "group",
      name: "Direction ACME",
      avatarPath: null,
      lastMessage: "Réunion demain à 14h — ordre du jour : budget T1 2026.",
      lastMessageAt: ago(180).toISOString(),
      unreadCount: 0,
      participants: [
        { userId: currentUserId, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        mockParticipants[2],
        mockParticipants[3],
        mockParticipants[4],
      ],
    },
    {
      id: 5,
      convType: "direct",
      name: "Claire Bernard",
      avatarPath: null,
      lastMessage: "Excellent ! Merci Claire.",
      lastMessageAt: ago(290).toISOString(),
      unreadCount: 0,
      participants: [
        { userId: currentUserId, displayName: "Moi", avatarPath: null, presenceStatus: "online" },
        mockParticipants[4],
      ],
    },
  ];
}

// ─── Service ─────────────────────────────────────────────────────────────────
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

export const chatService = {
  async getConversations(): Promise<ConversationSummary[]> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      return getMockConversations(uid);
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_get_conversations", { token });
    return raw.map(mapConversation);
  },

  async getMessages(
      conversationId: number,
      limit = 50,
      beforeId?: number
  ): Promise<MessageDto[]> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      initMockMessages(uid);
      const msgs = mockMessages.get(conversationId) ?? [];
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

  async sendMessage(
      conversationId: number,
      content: string,
      messageType: "text" | "image" | "file" = "text",
      replyToId?: number
  ): Promise<MessageDto> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      initMockMessages(uid);
      const newMsg: MessageDto = makeMsg(
          nextId(),
          conversationId,
          uid,
          content,
          new Date(),
          "sending",
          { messageType, replyToId: replyToId ?? null }
      );
      const msgs = mockMessages.get(conversationId) ?? [];
      msgs.push(newMsg);
      mockMessages.set(conversationId, msgs);
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

  async markAsRead(conversationId: number): Promise<void> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      initMockMessages(uid);
      return;
    }
    const token = useAuthStore.getState().token!;
    await invoke("cmd_mark_as_read", { token, conversationId });
  },

  async searchMessages(
      conversationId: number,
      query: string
  ): Promise<MessageDto[]> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      initMockMessages(uid);
      const q = query.toLowerCase();
      const msgs = mockMessages.get(conversationId) ?? [];
      return msgs.filter((m) => m.content?.toLowerCase().includes(q));
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_search_messages", {
      token,
      conversationId,
      query,
    });
    return raw.map(mapMessage);
  },

  /** Update message status in mock data (used by wsService simulation). */
  updateMockMessageStatus(conversationId: number, messageId: number, status: MessageDto["status"]) {
    const msgs = mockMessages.get(conversationId);
    if (!msgs) return;
    const msg = msgs.find((m) => m.id === messageId);
    if (msg) msg.status = status;
  },

  /** Append a mock incoming message (used by wsService simulation). */
  appendMockMessage(conversationId: number, msg: MessageDto) {
    const msgs = mockMessages.get(conversationId) ?? [];
    msgs.push(msg);
    mockMessages.set(conversationId, msgs);
  },

  /** Get direct-access to mock messages (for chatStore to merge incoming WS events). */
  getMockMessages(conversationId: number): MessageDto[] {
    return mockMessages.get(conversationId) ?? [];
  },

  nextMockId: () => nextId(),

  // ── User listing ─────────────────────────────────────────────────────────

  async listUsers(): Promise<UserForChat[]> {
    if (!isTauri()) {
      return [
        { id: 2, username: "alice.martin",    displayName: "Alice Martin",       email: "a.martin@acme.fr",   department: "Développement", avatarPath: null, presenceStatus: "online" },
        { id: 3, username: "bob.dupont",      displayName: "Bob Dupont",         email: "b.dupont@acme.fr",   department: "Commercial",    avatarPath: null, presenceStatus: "away"   },
        { id: 4, username: "claire.bernard",  displayName: "Claire Bernard",     email: "c.bernard@acme.fr",  department: "Finance",       avatarPath: null, presenceStatus: "busy"   },
        { id: 5, username: "david.moreau",    displayName: "David Moreau",       email: "d.moreau@acme.fr",   department: "Développement", avatarPath: null, presenceStatus: "online" },
        { id: 6, username: "emma.rousseau",   displayName: "Emma Rousseau",      email: "e.rousseau@acme.fr", department: "RH",            avatarPath: null, presenceStatus: "offline"},
        { id: 7, username: "francois.lambert",displayName: "François Lambert",   email: "f.lambert@acme.fr",  department: "Marketing",     avatarPath: null, presenceStatus: "online" },
        { id: 8, username: "gabrielle.simon", displayName: "Gabrielle Simon",    email: "g.simon@acme.fr",    department: "Direction",     avatarPath: null, presenceStatus: "away"   },
      ];
    }
    const token = useAuthStore.getState().token!;
    const raw = await invoke<any[]>("cmd_list_users", { token });
    return raw.map((u) => ({
      id:             u.id,
      username:       u.username,
      displayName:    u.display_name ?? u.displayName,
      email:          u.email ?? null,
      department:     u.department ?? null,
      avatarPath:     u.avatar_path ?? u.avatarPath ?? null,
      presenceStatus: u.presence_status ?? u.presenceStatus ?? "offline",
    }));
  },

  // ── Direct conversation ───────────────────────────────────────────────────

  /*async createDirectConversation(otherUserId: number): Promise<number> {
    if (!isTauri()) {
      // In mock mode: return an existing or new mock conv id
      const uid = useAuthStore.getState().user?.id ?? 1;
      const existing = getMockConversations(uid).find(
          (c) => c.convType === "direct" && c.participants.some((p) => p.userId === otherUserId)
      );
      if (existing) return existing.id;
      return ++mockNextId;
    }
    const token = useAuthStore.getState().token!;
    return invoke<number>("cmd_create_direct_conversation", { token, otherUserId });
  },*/
  async createDirectConversation(otherUserId: number): Promise<number> {
    if (!isTauri()) {
      const uid = useAuthStore.getState().user?.id ?? 1;
      const existing = getMockConversations(uid).find(
          (c) => c.convType === "direct" && c.participants.some((p) => p.userId === otherUserId)
      );
      if (existing) return existing.id;
      return ++mockNextId;
    }
    const token = useAuthStore.getState().token!;

    // ✅ Forcer un entier propre, jamais un float
    const safeId = Math.trunc(otherUserId);
    if (!safeId || safeId <= 0) throw new Error(`ID utilisateur invalide : ${otherUserId}`);

    return invoke<number>("cmd_create_direct_conversation", {
      token,
      otherUserId: safeId,
    });
  },

  // ── Group conversation ────────────────────────────────────────────────────

  async createGroupConversation(
      name: string,
      description: string,
      memberIds: number[]
  ): Promise<number> {
    if (!isTauri()) {
      return ++mockNextId;
    }
    const token = useAuthStore.getState().token!;
    return invoke<number>("cmd_create_group_conversation", {
      token,
      name,
      description,
      memberIds,
    });
  },
};
