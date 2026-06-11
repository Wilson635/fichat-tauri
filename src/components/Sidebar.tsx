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

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const initials = user?.displayName
      ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
      : "?";

  return (
      <aside
          className="flex shrink-0"
          style={{ width: 360, borderRight: "1px solid var(--color-border)" }}
      >
        {/* ── Rail gauche ───────────────────────────────────────────────────────── */}
        <div
            className="flex flex-col items-center justify-between py-3 shrink-0"
            style={{
              width: 56,
              backgroundColor: "var(--color-header-bg)",
              borderRight: "1px solid var(--color-border)",
            }}
        >
          {/* Top : avatar + actions principales */}
          <div className="flex flex-col items-center gap-1">
            {/* Avatar */}
            <button
                onClick={() => navigate("/profile")}
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 mb-2 overflow-hidden"
                style={{ backgroundColor: "var(--color-primary-500)" }}
                title={user?.displayName ?? "Profil"}
            >
              {user?.avatarPath ? (
                  <img src={user.avatarPath} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                  initials
              )}
            </button>

            <RailDivider />

            {/* Nouvelle discussion directe */}
            <RailButton
                title="Nouvelle discussion"
                onClick={() => setShowNewDirect(true)}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
            />

            {/* Nouveau groupe */}
            <RailButton
                title="Nouveau groupe"
                onClick={() => setShowNewGroup(true)}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
            />

            {/* Notifications */}
            <div className="w-10 h-10 flex items-center justify-center rounded-full">
              <NotificationCenter />
            </div>
          </div>

          {/* Bottom : thème, settings, admin */}
          <div className="flex flex-col items-center gap-1">
            {/* Thème */}
            <RailButton
                title={theme === "dark" ? "Mode clair" : "Mode sombre"}
                onClick={toggleTheme}
                icon={
                  theme === "dark" ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                  ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                  )
                }
            />

            {/* Paramètres */}
            <NavLink to="/settings" title="Paramètres">
              {({ isActive }) => (
                  <span
                      className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
                      style={{
                        color: isActive ? "var(--color-primary-500)" : "var(--color-text-muted)",
                        backgroundColor: isActive ? "var(--color-active)" : "transparent",
                      }}
                  >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              )}
            </NavLink>

            {/* Admin */}
            {user?.role === "system_admin" && (
                <NavLink to="/admin" title="Administration">
                  {({ isActive }) => (
                      <span
                          className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
                          style={{
                            color: isActive ? "var(--color-primary-500)" : "var(--color-text-muted)",
                            backgroundColor: isActive ? "var(--color-active)" : "transparent",
                          }}
                      >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
                  )}
                </NavLink>
            )}
          </div>
        </div>

        {/* ── Panneau principal ─────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: "var(--color-surface)" }}>

          {/* Titre */}
          <div
              className="flex items-center justify-between px-4 shrink-0"
              style={{ height: 56, backgroundColor: "var(--color-header-bg)" }}
          >
          <span className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>
            Discussions
          </span>
          </div>

          {/* Barre de recherche */}
          <div className="px-3 py-2 shrink-0">
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
                  placeholder="Rechercher ou démarrer une discussion"
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
                  <button onClick={onOpenGlobalSearch} title="Recherche globale (Ctrl+K)">
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

          {/* Liste des conversations */}
          <ConversationList searchQuery={searchQuery} onNewGroup={() => setShowNewGroup(true)} />
        </div>

        {/* Modals */}
        {showNewDirect && <NewDirectChatModal onClose={() => setShowNewDirect(false)} />}
        {showNewGroup  && <NewGroupModal      onClose={() => setShowNewGroup(false)} />}
      </aside>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function RailButton({
                      icon,
                      title,
                      onClick,
                    }: {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
      <button
          onClick={onClick}
          title={title}
          className="w-10 h-10 flex items-center justify-center rounded-full transition-colors hover:opacity-80"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        {icon}
      </button>
  );
}

function RailDivider() {
  return (
      <div
          className="w-6 my-1"
          style={{ height: 1, backgroundColor: "var(--color-border)" }}
      />
  );
}