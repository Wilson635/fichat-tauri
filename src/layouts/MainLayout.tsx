import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { PriorityNotificationModal } from "@/components/PriorityNotificationModal";
import { MessageActionsModal } from "@/components/MessageActionsModal";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { useChatStore } from "@/store/chatStore";
import { useNotificationStore } from "@/store/notificationStore";
import { requestNotificationPermission } from "@/services/notificationService";
import { isTauri } from "@/services/chatService";
import { AppToasts } from "@/components/AppToasts";

export function MainLayout() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const { connectWs, disconnectWs } = useChatStore();
  const { notifGranted, setNotifGranted } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    connectWs();
    return () => disconnectWs();
  }, []);

  useEffect(() => {
    if (!isTauri() || !("locks" in navigator)) return;
    let released = false;
    const abort = new AbortController();
    navigator.locks
      .request("fiecho-background", { signal: abort.signal }, () => new Promise<void>((resolve) => {
        const stop = () => {
          if (!released) {
            released = true;
            resolve();
          }
        };
        window.addEventListener("beforeunload", stop);
      }))
      .catch(() => {});
    return () => {
      abort.abort();
    };
  }, []);

  useEffect(() => {
    if (!notifGranted) {
      if (isTauri()) {
        requestNotificationPermission().then(setNotifGranted);
      } else if ("Notification" in window && Notification.permission === "granted") {
        setNotifGranted(true);
      }
    }
  }, [notifGranted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowGlobalSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlistenOpen: (() => void) | undefined;
    let unlistenClosed: (() => void) | undefined;
    let unlistenShow: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        unlistenOpen = await listen<number>("priority-open-conversation", (e) => {
          if (e.payload) navigate(`/conversations/${e.payload}`);
        });
        unlistenClosed = await listen("priority-overlay-closed", () => {
          useNotificationStore.getState().setPendingPriority(null);
        });
        unlistenShow = await listen<{
          title?: string;
          body?: string;
          conversationId?: number | null;
        }>("priority-show-card", (e) => {
          const title = e.payload?.title || "Conversation";
          const raw = String(e.payload?.body || "");
          const split = raw.indexOf(": ");
          const senderName = split > 0 && split < 80 ? raw.slice(0, split) : "";
          const content = senderName ? raw.slice(split + 2) : raw;
          useNotificationStore.getState().setPendingPriority({
            id: `prio-native-${Date.now()}`,
            conversationId: e.payload?.conversationId ?? 0,
            conversationName: title,
            senderName,
            content,
            createdAt: new Date().toISOString(),
            isRead: false,
            isPriority: true,
          });
        });
      })
      .catch(() => {});
    return () => {
      unlistenOpen?.();
      unlistenClosed?.();
      unlistenShow?.();
    };
  }, [navigate]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
      <main className="flex-1 overflow-hidden relative min-w-0">
        <Outlet />
      </main>
      <AppToasts />
      <PriorityNotificationModal />
      <MessageActionsModal />
      {showGlobalSearch && (
        <GlobalSearchModal onClose={() => setShowGlobalSearch(false)} />
      )}
    </div>
  );
}
