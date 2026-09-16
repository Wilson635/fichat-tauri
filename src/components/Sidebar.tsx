import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  useThemeStore,
  RAIL_WIDTH,
  SIDEBAR_LIST_DEFAULT,
  SIDEBAR_LIST_MIN,
  SIDEBAR_LIST_MAX,
  clampSidebarListWidth,
} from "@/store/themeStore";
import { useChatStore } from "@/store/chatStore";
import { ConversationList } from "@/components/ConversationList";
import { NewGroupModal } from "@/components/NewGroupModal";
import { NewDirectChatModal } from "@/components/NewDirectChatModal";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Icon } from "@/components/Icon";
import { AppLogo } from "@/components/AppLogo";

interface SidebarProps {
  onOpenGlobalSearch?: () => void;
}

export function Sidebar({ onOpenGlobalSearch }: SidebarProps) {
  const { user } = useAuthStore();
  const { theme, setTheme, sidebarWidth, setSidebarWidth } = useThemeStore();
  const { searchQuery, setSearchQuery } = useChatStore();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const [listWidth, setListWidth] = useState(() => clampSidebarListWidth(sidebarWidth));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startW: 0 });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const compactList = ["/admin", "/settings", "/profile"].some((p) => pathname.startsWith(p));
  const onChats = pathname === "/" || pathname.startsWith("/conversations");

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    setListWidth(clampSidebarListWidth(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const onResize = () => setListWidth((w) => clampSidebarListWidth(w));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.body.classList.remove("sidebar-resizing");
    };
  }, []);

  const endDrag = useCallback((clientX?: number) => {
    if (!dragRef.current.active) return;
    const x = clientX ?? dragRef.current.startX;
    const next = clampSidebarListWidth(dragRef.current.startW + (x - dragRef.current.startX));
    dragRef.current.active = false;
    setDragging(false);
    document.body.classList.remove("sidebar-resizing");
    setListWidth(next);
    setSidebarWidth(next);
  }, [setSidebarWidth]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      setListWidth(clampSidebarListWidth(dragRef.current.startW + (e.clientX - dragRef.current.startX)));
    };
    const onUp = (e: PointerEvent) => endDrag(e.clientX);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endDrag]);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: listWidth };
    setDragging(true);
    document.body.classList.add("sidebar-resizing");
  };

  const resetWidth = () => {
    const next = clampSidebarListWidth(SIDEBAR_LIST_DEFAULT);
    setListWidth(next);
    setSidebarWidth(next);
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside
      className="flex shrink-0 relative min-w-0"
      style={{
        width: compactList ? RAIL_WIDTH : RAIL_WIDTH + listWidth,
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <div
        className="flex flex-col items-center justify-between py-4 shrink-0"
        style={{ width: RAIL_WIDTH, backgroundColor: "var(--color-rail)" }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <AppLogo size={32} className="mb-1.5" />
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

          <button
            type="button"
            title="Discussions"
            onClick={() => navigate("/")}
            className={`icon-btn-rail ${onChats ? "is-active" : ""}`}
          >
            <Icon name="message" size={18} />
          </button>
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

      {!compactList && (
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ backgroundColor: "var(--color-sidebar-bg)" }}>
        <div className="flex items-center justify-between px-5 shrink-0" style={{ height: 60 }}>
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Discussions
          </span>
        </div>

        <div className="px-4 pb-2 shrink-0">
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
              className="flex-1 min-w-0 bg-transparent text-[13px] outline-none font-medium"
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
      )}

      {!compactList && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner la liste des discussions"
          aria-valuemin={SIDEBAR_LIST_MIN}
          aria-valuemax={SIDEBAR_LIST_MAX}
          aria-valuenow={listWidth}
          title="Glisser pour redimensionner · double-clic pour la largeur par défaut"
          className={`sidebar-resizer ${dragging ? "is-dragging" : ""}`}
          onPointerDown={startDrag}
          onDoubleClick={resetWidth}
        />
      )}

      {showNewDirect && <NewDirectChatModal onClose={() => setShowNewDirect(false)} />}
      {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} />}
    </aside>
  );
}
