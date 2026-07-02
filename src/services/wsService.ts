/**
 * WebSocket service.
 * In Tauri: connects to ws://127.0.0.1:9001 (started by the Rust backend).
 * In web preview: simulates WebSocket events in-memory for a realistic demo,
 *   AND uses BroadcastChannel so different browser tabs (users) exchange
 *   messages in real-time without a real server.
 */

import { useAuthStore } from "@/store/authStore";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Event types (mirror Rust ServerEvent) ───────────────────────────────────
export type WsEvent =
    | { type: "auth_ok"; user_id: number }
    | { type: "auth_error"; message: string }
    | { type: "new_message"; conversation_id: number; message: any }
    | { type: "message_status"; message_id: number; conversation_id: number; user_id: number; status: string }
    | { type: "typing"; conversation_id: number; user_id: number; display_name: string; is_typing: boolean }
    | { type: "presence"; user_id: number; status: string };

type WsEventListener = (event: WsEvent) => void;

const BROADCAST_CHANNEL_NAME = "fichat_ws_v1";

// ─── Service ─────────────────────────────────────────────────────────────────
class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: WsEventListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mockTimers: ReturnType<typeof setTimeout>[] = [];
  private connected = false;
  private channel: BroadcastChannel | null = null;

  on(listener: WsEventListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: WsEvent) {
    this.listeners.forEach((l) => l(event));
  }

  connect(token: string) {
    if (isTauri()) {
      this.connectNative(token);
    } else {
      this.connectMock(token);
    }
  }

  private connectNative(token: string) {
    if (this.ws) return;

    const url = `ws://127.0.0.1:9001`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ type: "auth", token }));
    };

    this.ws.onmessage = (e) => {
      try {
        const event: WsEvent = JSON.parse(e.data);
        this.emit(event);
        if (event.type === "auth_ok") {
          this.connected = true;
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      // Auto-reconnect after 3 seconds
      this.reconnectTimer = setTimeout(() => this.connectNative(token), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private connectMock(_token: string) {
    if (this.connected) return;
    this.connected = true;

    // ── BroadcastChannel: receive messages from other tabs ───────────────
    if (typeof BroadcastChannel !== "undefined") {
      if (this.channel) {
        this.channel.close();
      }
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.channel.onmessage = (e) => {
        try {
          const payload = e.data as { event: WsEvent; senderUserId: number };
          const myUserId = useAuthStore.getState().user?.id ?? -1;
          // Don't re-process events I sent myself (avoid echo)
          if (payload.senderUserId === myUserId) return;
          this.emit(payload.event);
        } catch {
          // ignore
        }
      };
    }

    // Simulate successful auth
    setTimeout(() => {
      const userId = useAuthStore.getState().user?.id ?? 1;
      this.emit({ type: "auth_ok", user_id: userId });
    }, 200);
  }

  /**
   * Broadcast a WsEvent to all OTHER tabs via BroadcastChannel (mock mode).
   * This is what makes cross-tab real-time messaging work.
   */
  broadcastEvent(event: WsEvent) {
    if (isTauri() || !this.channel) return;
    const myUserId = useAuthStore.getState().user?.id ?? -1;
    try {
      this.channel.postMessage({ event, senderUserId: myUserId });
    } catch {
      // ignore
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.mockTimers.forEach((t) => clearTimeout(t));
    this.mockTimers = [];
    this.ws?.close();
    this.ws = null;
    this.channel?.close();
    this.channel = null;
    this.connected = false;
  }

  sendTyping(conversationId: number) {
    if (isTauri() && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "typing", conversation_id: conversationId }));
    }
    // In mock mode, typing is handled locally by chatStore
  }

  sendStopTyping(conversationId: number) {
    if (isTauri() && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "stop_typing", conversation_id: conversationId }));
    }
  }

  /**
   * Simulate an incoming message after a delay (mock mode only).
   * Called by chatStore after the user sends a message, to simulate a reply.
   */
  simulateResponse(
      conversationId: number,
      responderId: number,
      responderName: string,
      content: string,
      delayMs = 3000
  ) {
    if (isTauri()) return;

    const timer = setTimeout(() => {
      const msg = {
        id: Date.now(),
        conversation_id: conversationId,
        conversationId,
        sender_id: responderId,
        senderId: responderId,
        sender_name: responderName,
        senderName: responderName,
        sender_avatar: null,
        senderAvatar: null,
        content,
        message_type: "text",
        messageType: "text",
        reply_to_id: null,
        replyToId: null,
        reply_to_content: null,
        replyToContent: null,
        is_edited: false,
        isEdited: false,
        is_deleted: false,
        isDeleted: false,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: "sent",
        attachments: [],
      };

      this.emit({
        type: "new_message",
        conversation_id: conversationId,
        message: msg,
      });
    }, delayMs);

    this.mockTimers.push(timer);
  }

  /**
   * Simulate delivery / read receipts for a sent message (mock mode).
   */
  simulateReceipts(conversationId: number, messageId: number) {
    if (isTauri()) return;

    const t1 = setTimeout(() => {
      this.emit({
        type: "message_status",
        message_id: messageId,
        conversation_id: conversationId,
        user_id: 0,
        status: "delivered",
      });
    }, 800);

    const t2 = setTimeout(() => {
      this.emit({
        type: "message_status",
        message_id: messageId,
        conversation_id: conversationId,
        user_id: 0,
        status: "read",
      });
    }, 2000);

    this.mockTimers.push(t1, t2);
  }

  /**
   * Simulate a typing indicator from a mock user (mock mode).
   */
  simulateTyping(conversationId: number, userId: number, displayName: string, durationMs = 2000) {
    if (isTauri()) return;

    this.emit({ type: "typing", conversation_id: conversationId, user_id: userId, display_name: displayName, is_typing: true });

    const t = setTimeout(() => {
      this.emit({ type: "typing", conversation_id: conversationId, user_id: userId, display_name: displayName, is_typing: false });
    }, durationMs);

    this.mockTimers.push(t);
  }

  isConnected() {
    return this.connected;
  }
}

export const wsService = new WebSocketService();
