import { isTauri } from "@/services/chatService";

// ─── Demande de permission ──────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("cmd_request_notification_permission");
      return result === "granted";
    } catch {
      return true;
    }
  }
  if ("Notification" in window) {
    if (Notification.permission === "granted") return true;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  }
  return false;
}

// ─── Toast natif Windows ───────────────────────────────────────────────────

export async function sendToastNotification(opts: {
  title: string;
  body: string;
  conversationId?: number;
}): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cmd_send_toast_notification", {
        title: opts.title,
        body: opts.body,
        conversationId: opts.conversationId ?? null,
      });
    } catch (e) {
      console.warn("Toast notification failed:", e);
    }
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: "/favicon.ico",
      tag: opts.conversationId ? `conv-${opts.conversationId}` : undefined,
      requireInteraction: false,
    });
    if (opts.conversationId) {
      n.onclick = () => {
        window.focus();
        window.location.hash = `/conversations/${opts.conversationId}`;
      };
    }
  }
}

// ─── Notification prioritaire (dialog modale bloquante) ────────────────────

export async function sendPriorityNotification(opts: {
  title: string;
  body: string;
}): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cmd_send_priority_notification", {
        title: opts.title,
        body: opts.body,
      });
    } catch (e) {
      console.warn("Priority notification failed:", e);
    }
    return;
  }
  alert(`${opts.title}\n\n${opts.body}`);
}

// ─── Badge sur l'icône de la barre des tâches ──────────────────────────────

export async function setBadgeCount(count: number): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cmd_set_badge_count", { count });
    } catch {}
  }
  if ("setAppBadge" in navigator) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch {}
  }
}

// ─── Notification de test immédiate ────────────────────────────────────────

export async function sendTestNotification(): Promise<{ success: boolean; method: string; error?: string }> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const method = await invoke<string>("cmd_test_notification");
      return { success: true, method };
    } catch (e: any) {
      return { success: false, method: "tauri", error: String(e) };
    }
  }
  // Navigateur
  if ("Notification" in window) {
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        return { success: false, method: "browser", error: "Permission refusée" };
      }
    }
    new Notification("FiChat — Test", {
      body: "Les notifications navigateur fonctionnent ✓",
      icon: "/favicon.ico",
    });
    return { success: true, method: "browser" };
  }
  return { success: false, method: "none", error: "Navigateur ne supporte pas les notifications" };
}

// ─── Amener la fenêtre au premier plan ─────────────────────────────────────

export async function focusWindow(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cmd_focus_window");
    } catch {}
  } else {
    window.focus();
  }
}

// ─── Son de notification ───────────────────────────────────────────────────

type SoundType = "message" | "priority" | "none";

export function playNotificationSound(type: SoundType): void {
  if (type === "none") return;
  try {
    const ctx = new AudioContext();

    if (type === "priority") {
      const playChime = (freq: number, startTime: number, duration = 0.35) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        osc.connect(gain);
        gain.connect(compressor);
        compressor.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      playChime(880, ctx.currentTime);
      playChime(1100, ctx.currentTime + 0.2);
      playChime(880, ctx.currentTime + 0.4);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1046, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {}
}
