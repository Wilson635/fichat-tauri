import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/store/notificationStore";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  return format(d, "dd/MM", { locale: fr });
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { items, markAllRead, markRead, clearAll, unreadCount, dndEnabled, setDnd } =
    useNotificationStore();

  const count = unreadCount();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleItemClick = (item: typeof items[0]) => {
    markRead(item.id);
    setOpen(false);
    navigate(`/conversations/${item.conversationId}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markAllRead(); }}
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors relative"
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ color: open ? "var(--color-primary-500)" : "var(--color-text-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-0.5"
            style={{ backgroundColor: "#ef4444" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-11 right-0 w-80 rounded-2xl shadow-2xl border overflow-hidden z-50"
          style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ backgroundColor: "var(--color-header-bg)", borderColor: "var(--color-border)" }}
          >
            <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
              Notifications
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDnd(!dndEnabled)}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors"
                style={{
                  backgroundColor: dndEnabled ? "rgba(239,68,68,0.1)" : "var(--color-surface-secondary)",
                  color: dndEnabled ? "#ef4444" : "var(--color-text-muted)",
                }}
                title="Ne pas déranger"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                {dndEnabled ? "DND actif" : "DND"}
              </button>
              {items.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Tout effacer
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--color-text-muted)", opacity: 0.4 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Aucune notification</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: item.isRead ? "transparent" : "var(--color-active)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = item.isRead ? "transparent" : "var(--color-active)"; }}
                >
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: item.isPriority ? "#ef4444" : `hsl(${item.conversationName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 45%)` }}
                    >
                      {item.isPriority ? "!" : item.conversationName.slice(0, 2).toUpperCase()}
                    </div>
                    {!item.isRead && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2" style={{ borderColor: "var(--color-surface)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate" style={{ color: item.isPriority ? "#ef4444" : "var(--color-text-primary)" }}>
                        {item.isPriority && "🚨 "}
                        {item.conversationName}
                      </span>
                      <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {formatNotifTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>{item.senderName}:</span> {item.content}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Permission request */}
          {typeof window !== "undefined" && "Notification" in window && Notification.permission === "default" && (
            <div className="px-4 py-3 border-t" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-secondary)" }}>
              <button
                onClick={async () => {
                  const perm = await Notification.requestPermission();
                  useNotificationStore.getState().setPermission(perm === "granted");
                }}
                className="w-full text-xs py-2 rounded-lg font-medium text-white"
                style={{ backgroundColor: "var(--color-primary-500)" }}
              >
                Activer les notifications navigateur
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
