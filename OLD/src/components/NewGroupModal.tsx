import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { chatService, UserForChat } from "@/services/chatService";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";

const presenceColors: Record<string, string> = {
  online:  "#22c55e",
  away:    "#f59e0b",
  busy:    "#ef4444",
  offline: "var(--color-border)",
};

interface Props {
  onClose: () => void;
}

export function NewGroupModal({ onClose }: Props) {
  const { user }        = useAuthStore();
  const navigate        = useNavigate();
  const { loadConversations } = useChatStore();

  const [users, setUsers]       = useState<UserForChat[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [groupName, setGroupName]       = useState("");
  const [description, setDescription]  = useState("");
  const [selectedIds, setSelectedIds]  = useState<number[]>([]);
  const [search, setSearch]            = useState("");
  const [creating, setCreating]        = useState(false);
  const [error, setError]              = useState<string | null>(null);

  useEffect(() => {
    chatService
        .listUsers()
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setLoadingUsers(false));
  }, []);

  const filtered = users.filter(
      (u) =>
          u.id !== user?.id &&
          (
              u.displayName.toLowerCase().includes(search.toLowerCase()) ||
              (u.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
              u.username.toLowerCase().includes(search.toLowerCase())
          )
  );

  const toggleUser = (id: number) => {
    setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedIds.length === 0 || creating) return;
    setCreating(true);
    setError(null);

    try {
      const convId = await chatService.createGroupConversation(
          groupName.trim(),
          description.trim(),
          selectedIds
      );
      await loadConversations();
      onClose();
      navigate(`/conversations/${convId}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setCreating(false);
    }
  };

  return (
      <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col"
            style={{ backgroundColor: "var(--color-surface)", maxHeight: "85vh" }}
        >
          {/* Header */}
          <div
              className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ backgroundColor: "var(--color-header-bg)" }}
          >
            <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Nouveau groupe
            </h2>
            <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ color: "var(--color-text-muted)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Error */}
            {error && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                  {error}
                </div>
            )}

            {/* Group name */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: "var(--color-text-muted)" }}>
                Nom du groupe *
              </label>
              <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ex : Équipe Marketing"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border"
                  style={{
                    backgroundColor: "var(--color-input-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: "var(--color-text-muted)" }}>
                Description (optionnel)
              </label>
              <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description du groupe…"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border"
                  style={{
                    backgroundColor: "var(--color-input-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
              />
            </div>

            {/* Members */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: "var(--color-text-muted)" }}>
                Ajouter des membres ({selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""})
              </label>

              <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2 border"
                  style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un utilisateur…"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: "var(--color-text-primary)" }}
                />
              </div>

              {/* Selected chips */}
              {selectedIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedIds.map((id) => {
                      const u = users.find((m) => m.id === id);
                      if (!u) return null;
                      return (
                          <button
                              key={id}
                              onClick={() => toggleUser(id)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: "var(--color-primary-500)" }}
                          >
                            {u.displayName.split(" ")[0]}
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                      );
                    })}
                  </div>
              )}

              {/* User list */}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {loadingUsers ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Chargement des utilisateurs…
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>
                      {search ? "Aucun résultat" : "Aucun utilisateur disponible"}
                    </p>
                ) : (
                    filtered.map((u) => {
                      const selected = selectedIds.includes(u.id);
                      const hue = u.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
                      const initials = u.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

                      return (
                          <button
                              key={u.id}
                              onClick={() => toggleUser(u.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left"
                              style={{ backgroundColor: selected ? "var(--color-active)" : "transparent" }}
                              onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)"; }}
                              onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                          >
                            <div className="relative shrink-0">
                              {u.avatarPath ? (
                                  <img src={u.avatarPath} alt={u.displayName} className="w-9 h-9 rounded-full object-cover" />
                              ) : (
                                  <div
                                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
                                  >
                                    {initials}
                                  </div>
                              )}
                              <span
                                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                                  style={{
                                    backgroundColor: presenceColors[u.presenceStatus] ?? presenceColors.offline,
                                    borderColor: "var(--color-surface)",
                                  }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                {u.displayName}
                              </div>
                              <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                                {u.department ?? u.username}
                              </div>
                            </div>
                            {selected && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-primary-500)" }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                          </button>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 shrink-0 border-t flex gap-2" style={{ borderColor: "var(--color-border)" }}>
            <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", backgroundColor: "transparent" }}
            >
              Annuler
            </button>
            <button
                onClick={handleCreate}
                disabled={!groupName.trim() || selectedIds.length === 0 || creating || loadingUsers}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {creating ? (
                  <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Création…
              </span>
              ) : (
                  "Créer le groupe"
              )}
            </button>
          </div>
        </div>
      </div>
  );
}
