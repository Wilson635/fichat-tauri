import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useChatStore } from "@/store/chatStore";
import { ConversationList } from "@/components/ConversationList";
import { NewGroupModal } from "@/components/NewGroupModal";
import { NewDirectChatModal } from "@/components/NewDirectChatModal";
import { NotificationCenter } from "@/components/NotificationCenter";

interface SidebarProps {
  onOpenGlobalSearch?: () => void;
}

export function Sidebar({ onOpenGlobalSearch }: SidebarProps) {
  const { user } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { searchQuery, setSearchQuery } = useChatStore();
  const [showNewGroup, setShowNewGroup]   = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const initials = user?.displayName
      ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
      : "?";

  return (
      <aside
          className="flex flex-col w-[300px] md:w-[360px] border-r shrink-0"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ backgroundColor: "var(--color-header-bg)" }}
        >
          <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 min-w-0"
          >
            <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {user?.avatarPath ? (
                  <img
                      src={user.avatarPath}
                      alt={user.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                  />
              ) : (
                  initials
              )}
            </div>
            <span className="font-medium text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
            {user?.displayName ?? "Utilisateur"}
          </span>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {/* Notifications */}
            <NotificationCenter />

            {/* New direct conversation */}
            <button
                onClick={() => setShowNewDirect(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Nouvelle discussion directe"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>

            {/* New group */}
            <button
                onClick={() => setShowNewGroup(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Nouveau groupe"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Dark/Light toggle */}
            <button
                onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title={theme === "dark" ? "Mode clair" : "Mode sombre"}
            >
              {theme === "dark" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
              ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
              )}
            </button>

            {/* Settings */}
            <NavLink
                to="/settings"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Paramètres"
            >
              {({ isActive }) => (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: isActive ? "var(--color-primary-500)" : "var(--color-text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
              )}
            </NavLink>

            {/* Admin (if admin) */}
            {user?.role === "system_admin" && (
                <NavLink
                    to="/admin"
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    title="Administration"
                >
                  {({ isActive }) => (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: isActive ? "var(--color-primary-500)" : "var(--color-text-muted)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                  )}
                </NavLink>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 shrink-0" style={{ backgroundColor: "var(--color-surface)" }}>
          <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: "var(--color-input-bg)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une conversation"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text-primary)" }}
            />
            {searchQuery ? (
                <button onClick={() => setSearchQuery("")}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
            ) : (
                <button
                    onClick={onOpenGlobalSearch}
                    title="Recherche globale (Ctrl+K)"
                    className="flex items-center gap-1 shrink-0"
                >
                  <kbd
                      className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: "var(--color-surface-secondary)",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                        fontSize: 10,
                      }}
                  >
                    Ctrl K
                  </kbd>
                </button>
            )}
          </div>
        </div>

        {/* Conversations list */}
        <ConversationList searchQuery={searchQuery} onNewGroup={() => setShowNewGroup(true)} />

        {/* New Direct Chat Modal */}
        {showNewDirect && <NewDirectChatModal onClose={() => setShowNewDirect(false)} />}

        {/* New Group Modal */}
        {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
      </aside>
  );
}
