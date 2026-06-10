import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { chatService, UserForChat } from "@/services/chatService";
import { useChatStore } from "@/store/chatStore";

const presenceColors: Record<string, string> = {
    online:  "#22c55e",
    away:    "#f59e0b",
    busy:    "#ef4444",
    offline: "var(--color-border)",
};

interface Props {
    onClose: () => void;
}

export function NewDirectChatModal({ onClose }: Props) {
    const navigate = useNavigate();
    const { loadConversations } = useChatStore();

    const [users, setUsers]       = useState<UserForChat[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState("");
    const [creating, setCreating] = useState<number | null>(null);
    const [error, setError]       = useState<string | null>(null);

    useEffect(() => {
        chatService
            .listUsers()
            .then(setUsers)
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = users.filter(
        (u) =>
            u.displayName.toLowerCase().includes(search.toLowerCase()) ||
            (u.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
            u.username.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = useCallback(
        async (u: UserForChat) => {
            if (creating !== null) return;
            setCreating(u.id);
            setError(null);
            try {
                const convId = await chatService.createDirectConversation(u.id);
                await loadConversations();
                onClose();
                navigate(`/conversations/${convId}`);
            } catch (e: any) {
                setError(e?.message ?? String(e));
                setCreating(null);
            }
        },
        [creating, loadConversations, navigate, onClose]
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col"
                style={{ backgroundColor: "var(--color-surface)", maxHeight: "80vh" }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-5 py-4 shrink-0"
                    style={{ backgroundColor: "var(--color-header-bg)" }}
                >
                    <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        Nouvelle discussion
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                        style={{ color: "var(--color-text-muted)" }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 py-3 shrink-0 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <div
                        className="flex items-center gap-2 rounded-lg px-3 py-2 border"
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
                            autoFocus
                            className="flex-1 bg-transparent text-sm outline-none"
                            style={{ color: "var(--color-text-primary)" }}
                        />
                        {search && (
                            <button onClick={() => setSearch("")}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="px-4 py-2 text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                        {error}
                    </div>
                )}

                {/* User list */}
                <div className="flex-1 overflow-y-auto py-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-24 gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Chargement…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-24 gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                            <span>Aucun utilisateur trouvé</span>
                        </div>
                    ) : (
                        filtered.map((u) => {
                            const isCreating = creating === u.id;
                            const hue = u.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
                            const initials = u.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

                            return (
                                <button
                                    key={u.id}
                                    onClick={() => handleSelect(u)}
                                    disabled={creating !== null}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left disabled:opacity-60"
                                    style={{ backgroundColor: "transparent" }}
                                    onMouseEnter={(e) => {
                                        if (creating === null) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-hover)";
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                    }}
                                >
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        {u.avatarPath ? (
                                            <img
                                                src={u.avatarPath}
                                                alt={u.displayName}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
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

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                            {u.displayName}
                                        </div>
                                        <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                                            {u.department ?? u.username}
                                        </div>
                                    </div>

                                    {/* Spinner while creating */}
                                    {isCreating && (
                                        <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer hint */}
                {!loading && users.length > 0 && (
                    <div className="px-4 py-2.5 text-xs text-center border-t shrink-0" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                        {users.length} utilisateur{users.length > 1 ? "s" : ""} disponible{users.length > 1 ? "s" : ""}
                    </div>
                )}
            </div>
        </div>
    );
}
