import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { chatService, MessageSearchResult } from "@/services/chatService";
import { useChatStore } from "@/store/chatStore";
import { format, isToday, isYesterday } from "date-fns";

interface Props {
  onClose: () => void;
}

function highlight(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{ backgroundColor: "var(--color-primary-500)", color: "#fff", borderRadius: 2, padding: "0 2px" }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatResultTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  return format(d, "dd/MM/yy");
}

export function GlobalSearchModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { conversations } = useChatStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setActiveIndex(0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await chatService.searchAllMessages(query, conversations);
        setResults(res);
        setActiveIndex(0);
      } finally {
        setIsLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, conversations]);

  const handleSelect = useCallback(
    (result: MessageSearchResult) => {
      onClose();
      navigate(`/conversations/${result.conversation.id}?highlight=${result.message.id}`);
    },
    [navigate, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const convInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const convHue = (name: string) =>
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "70vh",
        }}
      >
        {/* Input */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "var(--color-primary-500)" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher dans tous les messages…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text-primary)", fontSize: 15 }}
          />
          {isLoading && (
            <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {query && !isLoading && (
            <button onClick={() => setQuery("")} style={{ color: "var(--color-text-muted)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd
            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs shrink-0"
            style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Tapez pour rechercher dans tous les messages
              </p>
            </div>
          ) : results.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Aucun résultat pour « {query} »
              </p>
            </div>
          ) : (
            <>
              {query && results.length > 0 && (
                <div
                  className="px-4 py-2 text-xs"
                  style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}
                >
                  {results.length} résultat{results.length !== 1 ? "s" : ""}
                </div>
              )}
              {results.map((result, i) => {
                const isActive = i === activeIndex;
                const name = result.conversation.name;
                const hue = convHue(name);
                return (
                  <button
                    key={`${result.conversation.id}-${result.message.id}`}
                    data-index={i}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      backgroundColor: isActive ? "var(--color-active)" : "transparent",
                    }}
                  >
                    {/* Conv avatar */}
                    <div
                      className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-xs mt-0.5"
                      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
                    >
                      {convInitials(name)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold truncate" style={{ color: "var(--color-primary-500)" }}>
                          {name}
                        </span>
                        <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          {formatResultTime(result.message.createdAt)}
                        </span>
                      </div>
                      {result.message.senderName && (
                        <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                          {result.message.senderName}
                        </p>
                      )}
                      <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
                        {highlight(result.message.content ?? "", query)}
                      </p>
                    </div>

                    {/* Arrow */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4 shrink-0 mt-1 opacity-40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-4 px-4 py-2 shrink-0 text-xs"
          style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border)" }}>↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border)" }}>↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border)" }}>↵</kbd>
            ouvrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border)" }}>Esc</kbd>
            fermer
          </span>
        </div>
      </div>
    </div>
  );
}
