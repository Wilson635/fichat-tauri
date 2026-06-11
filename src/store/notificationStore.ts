import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface NotificationItem {
  id: string;
  conversationId: number;
  conversationName: string;
  senderName: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  isPriority: boolean;
}

export interface ConvNotifPrefs {
  enabled: boolean;
  sound: boolean;
}

interface NotificationState {
  items: NotificationItem[];
  convPrefs: Record<number, ConvNotifPrefs>;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  permissionGranted: boolean;
  pendingPriority: NotificationItem | null;

  addNotification: (item: Omit<NotificationItem, "id" | "isRead">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  setConvPrefs: (convId: number, prefs: Partial<ConvNotifPrefs>) => void;
  setDnd: (enabled: boolean, startHour?: number, endHour?: number) => void;
  setPermission: (granted: boolean) => void;
  dismissPriority: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      convPrefs: {},
      dndEnabled: false,
      dndStartHour: 22,
      dndEndHour: 8,
      permissionGranted: false,
      pendingPriority: null,

      addNotification: (item) => {
        const state = get();
        const prefs = state.convPrefs[item.conversationId];
        if (prefs && !prefs.enabled) return;

        const now = new Date();
        if (state.dndEnabled) {
          const h = now.getHours();
          const { dndStartHour: s, dndEndHour: e } = state;
          const inDnd = s > e ? h >= s || h < e : h >= s && h < e;
          if (inDnd && !item.isPriority) return;
        }

        const newItem: NotificationItem = {
          ...item,
          id: `notif-${Date.now()}-${Math.random()}`,
          isRead: false,
        };

        set((s) => ({
          items: [newItem, ...s.items].slice(0, 100),
          pendingPriority: item.isPriority ? newItem : s.pendingPriority,
        }));

        if (state.permissionGranted && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification(
            item.isPriority ? `🚨 Message prioritaire — ${item.conversationName}` : item.conversationName,
            {
              body: `${item.senderName}: ${item.content}`,
              icon: "/favicon.ico",
              tag: `conv-${item.conversationId}`,
            }
          );
          n.onclick = () => {
            window.focus();
            window.location.hash = `/conversations/${item.conversationId}`;
          };
        }

        if (prefs?.sound !== false) {
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = item.isPriority ? 880 : 440;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
          } catch {
            // Audio context may be unavailable
          }
        }
      },

      markAllRead: () =>
        set((s) => ({ items: s.items.map((i) => ({ ...i, isRead: true })) })),

      markRead: (id) =>
        set((s) => ({ items: s.items.map((i) => i.id === id ? { ...i, isRead: true } : i) })),

      clearAll: () => set({ items: [] }),

      /*setConvPrefs: (convId, prefs) =>
        set((s) => ({
          convPrefs: {
            ...s.convPrefs,
            [convId]: { enabled: true, sound: true, ...(s.convPrefs[convId] ?? {}), ...prefs },
          },
        })),*/

        setConvPrefs: (convId, prefs) =>
            set((s) => {
                // On récupère les préférences existantes ou les valeurs par défaut globales de l'appli
                const existing = s.convPrefs[convId] ?? { enabled: true, sound: true };

                return {
                    convPrefs: {
                        ...s.convPrefs,
                        [convId]: {
                            ...existing,
                            ...prefs,
                        } as ConvNotifPrefs,
                    },
                };
            }),

      setDnd: (dndEnabled, dndStartHour, dndEndHour) =>
        set((s) => ({
          dndEnabled,
          dndStartHour: dndStartHour ?? s.dndStartHour,
          dndEndHour: dndEndHour ?? s.dndEndHour,
        })),

      setPermission: (permissionGranted) => set({ permissionGranted }),

      dismissPriority: () => set({ pendingPriority: null }),

      unreadCount: () => get().items.filter((i) => !i.isRead).length,
    }),
    {
      name: "enterprise-chat-notifications",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        convPrefs: s.convPrefs,
        dndEnabled: s.dndEnabled,
        dndStartHour: s.dndStartHour,
        dndEndHour: s.dndEndHour,
        permissionGranted: s.permissionGranted,
      }),
    }
  )
);
