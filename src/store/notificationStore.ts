import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  sendToastNotification,
  sendPriorityNotification,
  setBadgeCount,
  playNotificationSound,
} from "@/services/notificationService";

export type NotifSoundType = "message" | "priority" | "none";

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
  sound: NotifSoundType;
  priority: boolean;
}

interface NotificationState {
  items: NotificationItem[];
  convPrefs: Record<number, ConvNotifPrefs>;
  globalSound: NotifSoundType;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  notifGranted: boolean;
  pendingPriority: NotificationItem | null;

  addNotification: (item: Omit<NotificationItem, "id" | "isRead">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  setConvPrefs: (convId: number, prefs: Partial<ConvNotifPrefs>) => void;
  setDnd: (enabled: boolean, startHour?: number, endHour?: number) => void;
  setGlobalSound: (sound: NotifSoundType) => void;
  setNotifGranted: (granted: boolean) => void;
  dismissPriority: () => void;
  unreadCount: () => number;
}

function isInDndRange(startHour: number, endHour: number): boolean {
  const h = new Date().getHours();
  return startHour > endHour
    ? h >= startHour || h < endHour
    : h >= startHour && h < endHour;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      convPrefs: {},
      globalSound: "message",
      dndEnabled: false,
      dndStartHour: 22,
      dndEndHour: 8,
      notifGranted: false,
      pendingPriority: null,

      addNotification: (item) => {
        const state = get();
        const prefs = state.convPrefs[item.conversationId];

        if (prefs && !prefs.enabled) return;

        const inDnd =
          state.dndEnabled &&
          isInDndRange(state.dndStartHour, state.dndEndHour);

        if (inDnd && !item.isPriority) return;

        const isPriority = item.isPriority || prefs?.priority === true;

        const newItem: NotificationItem = {
          ...item,
          isPriority,
          id: `notif-${Date.now()}-${Math.random()}`,
          isRead: false,
        };

        set((s) => ({
          items: [newItem, ...s.items].slice(0, 100),
          pendingPriority: isPriority ? newItem : s.pendingPriority,
        }));

        const soundType: NotifSoundType =
          prefs?.sound ?? state.globalSound;

        if (!inDnd) {
          playNotificationSound(soundType);
        }

        // Toujours tenter d'envoyer — le service gère permission et fallback
        if (isPriority) {
          sendPriorityNotification({
            title: `🚨 Message prioritaire — ${item.conversationName}`,
            body: `${item.senderName}: ${item.content}`,
          }).catch(() => {});
        } else {
          sendToastNotification({
            title: item.conversationName,
            body: `${item.senderName}: ${item.content}`,
            conversationId: item.conversationId,
          }).catch(() => {});
        }

        const total = [newItem, ...state.items].filter((i) => !i.isRead).length;
        setBadgeCount(total).catch(() => {});
      },

      markAllRead: () => {
        set((s) => ({ items: s.items.map((i) => ({ ...i, isRead: true })) }));
        setBadgeCount(0).catch(() => {});
      },

      markRead: (id) => {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
        }));
        const count = get().items.filter((i) => !i.isRead).length;
        setBadgeCount(count).catch(() => {});
      },

      clearAll: () => {
        set({ items: [] });
        setBadgeCount(0).catch(() => {});
      },

      setConvPrefs: (convId, prefs) =>
        set((s) => {
          const existing: ConvNotifPrefs = s.convPrefs[convId] ?? {
            enabled: true,
            sound: "message",
            priority: false,
          };
          return {
            convPrefs: {
              ...s.convPrefs,
              [convId]: { ...existing, ...prefs },
            },
          };
        }),

      setDnd: (dndEnabled, dndStartHour, dndEndHour) =>
        set((s) => ({
          dndEnabled,
          dndStartHour: dndStartHour ?? s.dndStartHour,
          dndEndHour: dndEndHour ?? s.dndEndHour,
        })),

      setGlobalSound: (globalSound) => set({ globalSound }),

      setNotifGranted: (notifGranted) => set({ notifGranted }),

      dismissPriority: () => set({ pendingPriority: null }),

      unreadCount: () => get().items.filter((i) => !i.isRead).length,
    }),
    {
      name: "enterprise-chat-notifications",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        convPrefs: s.convPrefs,
        globalSound: s.globalSound,
        dndEnabled: s.dndEnabled,
        dndStartHour: s.dndStartHour,
        dndEndHour: s.dndEndHour,
        notifGranted: s.notifGranted,
      }),
    }
  )
);
