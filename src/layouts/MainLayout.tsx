import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
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

  useEffect(() => {
    connectWs();
    return () => disconnectWs();
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

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar onOpenGlobalSearch={() => setShowGlobalSearch(true)} />
      <main className="flex-1 overflow-hidden relative">
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
