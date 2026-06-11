import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { PriorityNotificationModal } from "@/components/PriorityNotificationModal";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";

export function MainLayout() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

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
      {showGlobalSearch && (
        <GlobalSearchModal onClose={() => setShowGlobalSearch(false)} />
      )}
    </div>
  );
}
