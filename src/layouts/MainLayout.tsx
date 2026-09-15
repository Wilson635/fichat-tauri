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
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<number>("priority-open-conversation", (e) => {
          if (e.payload) navigate(`/conversations/${e.payload}`);
        }),
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [navigate]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
      <main className="flex-1 overflow-hidden relative min-w-0">
        <Outlet />
      </main>
      <PriorityNotificationModal />
      <MessageActionsModal />
      {showGlobalSearch && (
        <GlobalSearchModal onClose={() => setShowGlobalSearch(false)} />
      )}
    </div>
  );
}
