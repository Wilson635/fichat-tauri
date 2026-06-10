/**
 * Mock database — localStorage-backed in-memory store.
 * Single source of truth for all data when running without Tauri.
 */

import type {
  ConversationSummary,
  MessageDto,
  ParticipantInfo,
  UserForChat,
} from "./chatService";

const CONV_KEY_PREFIX = "ec_db_conv_";
const MSGS_KEY_PREFIX = "ec_db_msgs_";
const NEXT_ID_KEY = "ec_db_next_id";

// ─── All system users ─────────────────────────────────────────────────────────

export const SYSTEM_USERS: UserForChat[] = [
  { id: 2, username: "alice.martin",     displayName: "Alice Martin",     email: "a.martin@acme.fr",    department: "Développement", avatarPath: null, presenceStatus: "online"  },
  { id: 3, username: "bob.dupont",       displayName: "Bob Dupont",       email: "b.dupont@acme.fr",    department: "Commercial",    avatarPath: null, presenceStatus: "away"    },
  { id: 4, username: "claire.bernard",   displayName: "Claire Bernard",   email: "c.bernard@acme.fr",   department: "Finance",       avatarPath: null, presenceStatus: "busy"    },
  { id: 5, username: "david.moreau",     displayName: "David Moreau",     email: "d.moreau@acme.fr",    department: "Développement", avatarPath: null, presenceStatus: "online"  },
  { id: 6, username: "emma.rousseau",    displayName: "Emma Rousseau",    email: "e.rousseau@acme.fr",  department: "RH",            avatarPath: null, presenceStatus: "offline" },
  { id: 7, username: "francois.lambert", displayName: "François Lambert", email: "f.lambert@acme.fr",   department: "Marketing",     avatarPath: null, presenceStatus: "online"  },
  { id: 8, username: "gabrielle.simon",  displayName: "Gabrielle Simon",  email: "g.simon@acme.fr",     department: "Direction",     avatarPath: null, presenceStatus: "away"    },
];

export function getUserById(userId: number): UserForChat | undefined {
  return SYSTEM_USERS.find((u) => u.id === userId);
}

function makeParticipant(userId: number, currentUserId: number, role: "admin" | "member" = "member"): ParticipantInfo {
  if (userId === currentUserId) {
    return { userId, displayName: "Moi", avatarPath: null, presenceStatus: "online", role };
  }
  const u = getUserById(userId);
  return {
    userId,
    displayName: u?.displayName ?? `User ${userId}`,
    avatarPath: null,
    presenceStatus: (u?.presenceStatus ?? "offline") as ParticipantInfo["presenceStatus"],
    role,
  };
}

// ─── ID generator ─────────────────────────────────────────────────────────────

let _nextId = 1000;

function loadNextId(): void {
  try {
    const s = localStorage.getItem(NEXT_ID_KEY);
    if (s) _nextId = Math.max(_nextId, parseInt(s, 10));
  } catch {}
}

export function nextId(): number {
  loadNextId();
  const id = ++_nextId;
  try { localStorage.setItem(NEXT_ID_KEY, String(id)); } catch {}
  return id;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}
function daysAgo(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ─── Default seed data ────────────────────────────────────────────────────────

function buildDefaultConversations(uid: number): ConversationSummary[] {
  return [
    {
      id: 1, convType: "direct", name: "Alice Martin", avatarPath: null,
      lastMessage: "Il y a quelques points importants à discuter en équipe.",
      lastMessageAt: ago(28), unreadCount: 2,
      participants: [makeParticipant(uid, uid, "admin"), makeParticipant(2, uid)],
    },
    {
      id: 2, convType: "group", name: "Équipe Dev", avatarPath: null,
      lastMessage: "Excellent, merci Alice !",
      lastMessageAt: ago(30), unreadCount: 3,
      participants: [makeParticipant(uid, uid, "admin"), makeParticipant(2, uid), makeParticipant(5, uid)],
    },
    {
      id: 3, convType: "direct", name: "Bob Dupont", avatarPath: null,
      lastMessage: "Merci pour le document !",
      lastMessageAt: ago(240), unreadCount: 0,
      participants: [makeParticipant(uid, uid, "admin"), makeParticipant(3, uid)],
    },
    {
      id: 4, convType: "group", name: "Direction ACME", avatarPath: null,
      lastMessage: "Réunion demain à 14h — ordre du jour : budget T1 2026.",
      lastMessageAt: ago(180), unreadCount: 0,
      participants: [makeParticipant(uid, uid, "admin"), makeParticipant(2, uid), makeParticipant(3, uid), makeParticipant(4, uid)],
    },
    {
      id: 5, convType: "direct", name: "Claire Bernard", avatarPath: null,
      lastMessage: "Excellent ! Merci Claire.",
      lastMessageAt: ago(290), unreadCount: 0,
      participants: [makeParticipant(uid, uid, "admin"), makeParticipant(4, uid)],
    },
  ];
}

function buildDefaultMessages(uid: number): Record<number, MessageDto[]> {
  function msg(id: number, convId: number, senderId: number | null, content: string, createdAt: string, status: MessageDto["status"] = "read"): MessageDto {
    const sender = senderId && senderId !== uid ? getUserById(senderId) : null;
    return {
      id, conversationId: convId, senderId,
      senderName: sender?.displayName ?? null,
      senderAvatar: null, content,
      messageType: "text", replyToId: null, replyToContent: null,
      isEdited: false, isDeleted: false, createdAt, status, attachments: [],
    };
  }
  return {
    1: [
      msg(1,  1, 2,   "Bonjour ! Comment se passe votre journée ?",                     daysAgo(3, 9, 10)),
      msg(2,  1, uid, "Très bien merci ! Beaucoup de travail en ce moment.",             daysAgo(3, 9, 15)),
      msg(3,  1, 2,   "Je comprends. Avez-vous eu le temps de regarder le rapport Q3 ?", daysAgo(3, 9, 30)),
      msg(4,  1, uid, "Pas encore, je le fais ce soir.",                                 daysAgo(3, 9, 32)),
      msg(5,  1, 2,   "Pas de problème, prenez votre temps.",                            daysAgo(3, 9, 35)),
      msg(6,  1, uid, "Je vous envoie mes commentaires demain matin.",                   daysAgo(2, 8, 5)),
      msg(7,  1, 2,   "Parfait, merci ! À demain.",                                      daysAgo(2, 8, 7)),
      msg(8,  1, 2,   "Bonjour, avez-vous eu le temps de regarder le rapport ?",        ago(30), "delivered"),
      msg(9,  1, 2,   "Il y a quelques points importants à discuter en équipe.",         ago(28), "sent"),
    ],
    2: [
      msg(20, 2, 5,   "La PR pour le module d'auth est prête à reviewer.",               daysAgo(1, 14, 0)),
      msg(21, 2, uid, "Je regarde ça dans l'heure.",                                     daysAgo(1, 14, 5)),
      msg(22, 2, 2,   "J'ai laissé quelques commentaires, rien de bloquant.",            daysAgo(1, 14, 45)),
      msg(23, 2, 5,   "Merci, je corrige et je repasse en review.",                      daysAgo(1, 15, 0)),
      msg(24, 2, uid, "La démo est prête pour demain.",                                  ago(120), "delivered"),
      msg(25, 2, 2,   "Super ! On se retrouve en salle Étoile à 14h.",                  ago(115), "sent"),
      msg(26, 2, 5,   "Je serai là. Qui prépare le slide de présentation ?",             ago(60), "sent"),
      msg(27, 2, 2,   "Je m'en charge. 😊",                                              ago(45), "sent"),
      msg(28, 2, 5,   "Excellent, merci Alice !",                                        ago(30), "sent"),
    ],
    3: [
      msg(40, 3, uid, "Bob, peux-tu m'envoyer le contrat signé ?",    daysAgo(5, 10, 0)),
      msg(41, 3, 3,   "Bien sûr, je te l'envoie aujourd'hui.",        daysAgo(5, 10, 15)),
      msg(42, 3, 3,   "C'est fait, regarde ta boite mail.",           daysAgo(4, 16, 30)),
      msg(43, 3, uid, "Reçu, merci beaucoup !",                       daysAgo(4, 16, 35)),
      msg(44, 3, 3,   "Merci pour le document !",                     ago(240)),
    ],
    4: [
      msg(60, 4, 4,   "Réunion de direction vendredi à 9h.",                           daysAgo(2, 8, 0)),
      msg(61, 4, uid, "Noté, je serai présent.",                                        daysAgo(2, 8, 10)),
      msg(62, 4, 2,   "Moi aussi.",                                                     daysAgo(2, 8, 15)),
      msg(63, 4, 3,   "Je ne pourrai pas, déplacement client.",                        daysAgo(2, 8, 20)),
      msg(64, 4, 4,   "Réunion demain à 14h — ordre du jour : budget T1 2026.",        ago(180)),
    ],
    5: [
      msg(80, 5, 4,   "Bonjour, j'ai finalisé le budget prévisionnel.",                daysAgo(1, 9, 0)),
      msg(81, 5, uid, "Très bien, je le transmets à la direction.",                     daysAgo(1, 9, 10)),
      msg(82, 5, 4,   "Le budget a été validé ✓",                                      ago(300)),
      msg(83, 5, uid, "Excellent ! Merci Claire.",                                      ago(290)),
    ],
  };
}

// ─── Conversations CRUD ───────────────────────────────────────────────────────

function convKey(uid: number): string { return `${CONV_KEY_PREFIX}${uid}`; }

export function dbLoadConversations(uid: number): ConversationSummary[] {
  loadNextId();
  try {
    const s = localStorage.getItem(convKey(uid));
    if (s) return JSON.parse(s) as ConversationSummary[];
  } catch {}
  const defaults = buildDefaultConversations(uid);
  dbSaveConversations(uid, defaults);
  return defaults;
}

function dbSaveConversations(uid: number, convs: ConversationSummary[]): void {
  try { localStorage.setItem(convKey(uid), JSON.stringify(convs)); } catch {}
}

export function dbAddConversation(uid: number, conv: ConversationSummary): void {
  const convs = dbLoadConversations(uid);
  convs.unshift(conv);
  dbSaveConversations(uid, convs);
}

export function dbUpdateConversation(uid: number, convId: number, updates: Partial<ConversationSummary>): void {
  const convs = dbLoadConversations(uid);
  const idx = convs.findIndex((c) => c.id === convId);
  if (idx >= 0) {
    convs[idx] = { ...convs[idx], ...updates };
    dbSaveConversations(uid, convs);
  }
}

export function dbAddGroupMember(uid: number, convId: number, member: ParticipantInfo): void {
  const convs = dbLoadConversations(uid);
  const conv = convs.find((c) => c.id === convId);
  if (conv && !conv.participants.some((p) => p.userId === member.userId)) {
    conv.participants.push(member);
    dbSaveConversations(uid, convs);
  }
}

export function dbRemoveGroupMember(uid: number, convId: number, userId: number): void {
  const convs = dbLoadConversations(uid);
  const conv = convs.find((c) => c.id === convId);
  if (conv) {
    conv.participants = conv.participants.filter((p) => p.userId !== userId);
    dbSaveConversations(uid, convs);
  }
}

export function dbUpdateGroupMemberRole(uid: number, convId: number, userId: number, role: "admin" | "member"): void {
  const convs = dbLoadConversations(uid);
  const conv = convs.find((c) => c.id === convId);
  if (conv) {
    const p = conv.participants.find((p) => p.userId === userId);
    if (p) {
      p.role = role;
      dbSaveConversations(uid, convs);
    }
  }
}

// ─── Messages CRUD ────────────────────────────────────────────────────────────

function msgsKey(uid: number): string { return `${MSGS_KEY_PREFIX}${uid}`; }

let _msgsCache: Record<number, MessageDto[]> | null = null;
let _msgsCacheUid: number | null = null;

function getMsgsCache(uid: number): Record<number, MessageDto[]> {
  if (_msgsCache && _msgsCacheUid === uid) return _msgsCache;
  try {
    const s = localStorage.getItem(msgsKey(uid));
    if (s) {
      _msgsCache = JSON.parse(s);
      _msgsCacheUid = uid;
      return _msgsCache!;
    }
  } catch {}
  const defaults = buildDefaultMessages(uid);
  _msgsCache = defaults;
  _msgsCacheUid = uid;
  saveMsgsCache(uid);
  return _msgsCache;
}

function saveMsgsCache(uid: number): void {
  if (!_msgsCache) return;
  try { localStorage.setItem(msgsKey(uid), JSON.stringify(_msgsCache)); } catch {}
}

export function dbGetMessages(uid: number, convId: number): MessageDto[] {
  const cache = getMsgsCache(uid);
  return cache[convId] ?? [];
}

export function dbAddMessage(uid: number, msg: MessageDto): void {
  const cache = getMsgsCache(uid);
  if (!cache[msg.conversationId]) cache[msg.conversationId] = [];
  cache[msg.conversationId].push(msg);
  saveMsgsCache(uid);
}

export function dbUpdateMessageStatus(uid: number, convId: number, msgId: number, status: MessageDto["status"]): void {
  const cache = getMsgsCache(uid);
  const msgs = cache[convId];
  if (!msgs) return;
  const m = msgs.find((m) => m.id === msgId);
  if (m) { m.status = status; saveMsgsCache(uid); }
}

export function dbInitConvMessages(uid: number, convId: number): void {
  const cache = getMsgsCache(uid);
  if (!cache[convId]) {
    cache[convId] = [];
    saveMsgsCache(uid);
  }
}
