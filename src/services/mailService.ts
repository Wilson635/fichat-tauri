import { useAuthStore } from "@/store/authStore";

export interface MailMessage {
  id: number;
  folder: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  isRead: boolean;
  createdAt: string;
}

export interface InboundStatus {
  enabled: boolean;
  bind: string;
  domain: string;
  listening: boolean;
  lastError: string | null;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("mock");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

function token(): string {
  return useAuthStore.getState().token ?? "";
}

const MOCK: MailMessage[] = [
  {
    id: 1,
    folder: "inbox",
    fromEmail: "direction@firsttrust.cm",
    toEmail: "vous@firsttrust.cm",
    subject: "Exemple — Zimbra est hors service",
    bodyText:
      "Ceci est un aperçu. En application réelle, les mails internes entre utilisateurs FiEcho arrivent ici même si Zimbra est arrêté.",
    isRead: false,
    createdAt: new Date().toISOString(),
  },
];

export const mailService = {
  async list(folder: "inbox" | "sent"): Promise<MailMessage[]> {
    if (!isTauri()) {
      return folder === "inbox" ? MOCK : [];
    }
    return invoke<MailMessage[]>("cmd_mail_list", { token: token(), folder });
  },

  async get(id: number): Promise<MailMessage> {
    if (!isTauri()) {
      return MOCK.find((m) => m.id === id) ?? MOCK[0];
    }
    return invoke<MailMessage>("cmd_mail_get", { token: token(), id });
  },

  async send(to: string, subject: string, body: string): Promise<number> {
    if (!isTauri()) return Date.now();
    return invoke<number>("cmd_mail_send", { token: token(), to, subject, body });
  },

  async unreadCount(): Promise<number> {
    if (!isTauri()) return 1;
    try {
      return await invoke<number>("cmd_mail_unread_count", { token: token() });
    } catch {
      return 0;
    }
  },

  async inboundStatus(): Promise<InboundStatus | null> {
    if (!isTauri()) {
      return {
        enabled: false,
        bind: "127.0.0.1:2525",
        domain: "firsttrust.cm",
        listening: false,
        lastError: null,
      };
    }
    try {
      return await invoke<InboundStatus>("cmd_mail_inbound_status", { token: token() });
    } catch {
      return null;
    }
  },
};
