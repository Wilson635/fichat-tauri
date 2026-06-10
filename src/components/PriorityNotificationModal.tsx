import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/store/notificationStore";

export function PriorityNotificationModal() {
  const { pendingPriority, dismissPriority } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingPriority) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") dismissPriority();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingPriority]);

  if (!pendingPriority) return null;

  const handleOpen = () => {
    dismissPriority();
    navigate(`/conversations/${pendingPriority.conversationId}`);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Red priority bar */}
        <div className="h-1.5 bg-red-500" />

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-100 dark:bg-red-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-red-500">
                  Message Prioritaire
                </span>
              </div>
              <h3 className="font-semibold text-base mb-0.5" style={{ color: "var(--color-text-primary)" }}>
                {pendingPriority.conversationName}
              </h3>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                {pendingPriority.senderName}
              </p>
              <p
                className="text-sm leading-relaxed p-3 rounded-xl"
                style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-primary)" }}
              >
                {pendingPriority.content}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={dismissPriority}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Ignorer
            </button>
            <button
              onClick={handleOpen}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all bg-red-500 hover:bg-red-600"
            >
              Ouvrir la conversation
            </button>
          </div>

          <p className="text-center text-xs mt-3" style={{ color: "var(--color-text-muted)" }}>
            Appuyez sur Entrée ou Échap pour fermer
          </p>
        </div>
      </div>
    </div>
  );
}
