import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useChatStore } from "@/store/chatStore";
import { ConversationList } from "@/components/ConversationList";
import { NewGroupModal } from "@/components/NewGroupModal";
import { NewDirectChatModal } from "@/components/NewDirectChatModal";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Icon } from "@/components/Icon";

interface SidebarProps {
  onOpenGlobalSearch?: () => void;
}

export function Sidebar({ onOpenGlobalSearch }: SidebarProps) {
  const { user } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { searchQuery, setSearchQuery } = useChatStore();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const navigate = useNavigate();

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside
      className="flex shrink-0"
      style={{ width: 380, borderRight: "1px solid var(--color-border)" }}
    >
      <div
        className="flex flex-col items-center justify-between py-4 shrink-0"
        style={{ width: 64, backgroundColor: "var(--color-rail)" }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-semibold text-white shrink-0 mb-2 overflow-hidden"
            style={{ backgroundColor: "var(--color-primary-500)" }}
            title={user?.displayName ?? "Profil"}
          >
            {user?.avatarPath ? (
              <img src={user.avatarPath} alt={user.displayName} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </button>

          <div className="w-7 my-1" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />

          <button type="button" title="Nouvelle discussion" onClick={() => setShowNewDirect(true)} className="icon-btn-rail">
            <Icon name="userPlus" size={18} />
          </button>
          <button type="button" title="Nouveau groupe" onClick={() => setShowNewGroup(true)} className="icon-btn-rail">
            <Icon name="users" size={18} />
          </button>
          <NotificationCenter variant="rail" />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            title="Apparence"
            onClick={toggleTheme}
            className="icon-btn-rail"
          >
            <Icon name="contrast" size={18} />
          </button>

          <NavLink to="/settings" title="Paramètres">
            {({ isActive }) => (
              <span className={`icon-btn-rail ${isActive ? "is-active" : ""}`}>
                <Icon name="settings" size={18} />
              </span>
            )}
          </NavLink>

          {user?.role === "system_admin" && (
            <NavLink to="/admin" title="Administration">
              {({ isActive }) => (
                <span className={`icon-btn-rail ${isActive ? "is-active" : ""}`}>
                  <Icon name="shield" size={18} />
                </span>
              )}
            </NavLink>
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: "var(--color-sidebar-bg)" }}>
        <div className="flex items-center justify-between px-5 shrink-0" style={{ height: 60 }}>
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Discussions
          </span>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <div
            className="flex items-center gap-2 rounded-xl px-3 h-10"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <Icon name="search" size={16} style={{ color: "var(--color-text-muted)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher…"
              className="flex-1 bg-transparent text-[13px] outline-none font-medium"
              style={{ color: "var(--color-text-primary)" }}
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery("")} className="text-muted">
                <Icon name="x" size={14} style={{ color: "var(--color-text-muted)" }} />
              </button>
            ) : (
              <button type="button" onClick={onOpenGlobalSearch} title="Recherche globale (Ctrl+K)">
                <kbd
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--color-surface-secondary)",
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  ⌘K
                </kbd>
              </button>
            )}
          </div>
        </div>

        <ConversationList searchQuery={searchQuery} onNewGroup={() => setShowNewGroup(true)} />
      </div>

      {showNewDirect && <NewDirectChatModal onClose={() => setShowNewDirect(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </aside>
  );
}
