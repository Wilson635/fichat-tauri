import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { PriorityNotificationModal } from "@/components/PriorityNotificationModal";

export function MainLayout() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
      <PriorityNotificationModal />
    </div>
  );
}
