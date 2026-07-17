import { useEffect, useRef, useState } from "react";
import { useMessageActionStore } from "@/store/messageActionStore";
import { useChatStore } from "@/store/chatStore";

// ─── Modal Supprimer ──────────────────────────────────────────────────────────

function DeleteModal() {
  const { pendingDelete, closeDelete } = useMessageActionStore();
  const { deleteMessage } = useChatStore();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDelete();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!pendingDelete) return null;

  const handleConfirm = () => {
    deleteMessage(pendingDelete.conversationId, pendingDelete.message.id);
    closeDelete();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) closeDelete(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="h-1 bg-red-500" />

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
            >
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>
                Supprimer le message
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Cette action est irréversible
              </p>
            </div>
          </div>

          {pendingDelete.message.content && (
            <div
              className="rounded-xl px-3 py-2.5 mb-5 text-sm italic leading-relaxed"
              style={{
                backgroundColor: "var(--color-surface-secondary)",
                color: "var(--color-text-secondary)",
                borderLeft: "3px solid var(--color-border)",
              }}
            >
              "{pendingDelete.message.content}"
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={closeDelete}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Modifier ───────────────────────────────────────────────────────────

function EditModal() {
  const { pendingEdit, closeEdit } = useMessageActionStore();
  const { editMessage } = useChatStore();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX = 4000;

  useEffect(() => {
    if (pendingEdit) {
      setContent(pendingEdit.message.content ?? "");
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length ?? 0;
        textareaRef.current?.setSelectionRange(len, len);
      }, 50);
    }
  }, [pendingEdit]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEdit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!pendingEdit) return null;

  const trimmed = content.trim();
  const canSave = trimmed.length > 0 && trimmed !== (pendingEdit.message.content ?? "").trim();

  const handleSave = () => {
    if (!canSave) return;
    editMessage(pendingEdit.conversationId, pendingEdit.message.id, trimmed);
    closeEdit();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") { e.preventDefault(); closeEdit(); }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="h-1" style={{ backgroundColor: "#f59e0b" }} />

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(245,158,11,0.1)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#f59e0b" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>
                Modifier le message
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Entrée pour sauvegarder · Échap pour annuler
              </p>
            </div>
          </div>

          <div
            className="rounded-xl overflow-hidden border mb-1"
            style={{ borderColor: "var(--color-border)" }}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX))}
              onKeyDown={handleKey}
              rows={4}
              className="w-full px-4 py-3 resize-none text-sm outline-none bg-transparent"
              style={{ color: "var(--color-text-primary)" }}
              placeholder="Contenu du message…"
            />
          </div>

          <p
            className="text-right text-xs mb-4"
            style={{ color: content.length > MAX * 0.9 ? "#ef4444" : "var(--color-text-muted)" }}
          >
            {content.length}/{MAX}
          </p>

          <div className="flex gap-3">
            <button
              onClick={closeEdit}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{
                backgroundColor: canSave ? "#f59e0b" : "var(--color-border)",
                color: canSave ? "#fff" : "var(--color-text-muted)",
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              Sauvegarder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export combiné ───────────────────────────────────────────────────────────

export function MessageActionsModal() {
  const { pendingEdit, pendingDelete } = useMessageActionStore();
  if (pendingDelete) return <DeleteModal />;
  if (pendingEdit)   return <EditModal />;
  return null;
}
