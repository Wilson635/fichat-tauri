import { useState, useRef, useEffect, useCallback } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto } from "@/services/chatService";

interface Props {
  onSend: (content: string, replyToId?: number) => void;
  onTyping: () => void;
  replyTo: MessageDto | null;
  onCancelReply: () => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, replyTo, onCancelReply, disabled }: Props) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useThemeStore();

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const send = useCallback(() => {
    const content = text.trim();
    if (!content || disabled) return;
    onSend(content, replyTo?.id);
    setText("");
    onCancelReply();
    inputRef.current?.focus();
  }, [text, disabled, replyTo, onSend, onCancelReply]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onTyping();
  };

  const addEmoji = (emoji: any) => {
    setText((prev) => prev + (emoji.native ?? ""));
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [text]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{ backgroundColor: "var(--color-header-bg)" }}
    >
      {replyTo && (
        <div
          className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border-l-4"
          style={{
            backgroundColor: "var(--color-surface-secondary)",
            borderColor: "var(--color-primary-500)",
          }}
        >
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold block" style={{ color: "var(--color-primary-500)" }}>
              Répondre à {replyTo.senderName ?? "Moi"}
            </span>
            <span className="text-xs truncate block" style={{ color: "var(--color-text-muted)" }}>
              {replyTo.content}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--color-border)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div
          className="flex-1 flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          <div className="relative self-end pb-0.5">
            <button
              onClick={() => setShowEmoji((v) => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ color: showEmoji ? "var(--color-primary-500)" : "var(--color-text-muted)" }}
              title="Émojis"
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {showEmoji && (
              <div
                className="absolute bottom-10 left-0 z-50"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Picker
                  data={data}
                  onEmojiSelect={addEmoji}
                  theme={isDark ? "dark" : "light"}
                  locale="fr"
                  previewPosition="none"
                  skinTonePosition="none"
                />
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            disabled={disabled}
            rows={1}
            placeholder="Écrivez un message…"
            className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed py-1"
            style={{ color: "var(--color-text-primary)", maxHeight: 120 }}
          />
        </div>

        <button
          onClick={send}
          disabled={!text.trim() || disabled}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{
            backgroundColor: text.trim() ? "var(--color-primary-500)" : "var(--color-surface-secondary)",
            color: text.trim() ? "#fff" : "var(--color-text-muted)",
            transform: text.trim() ? "scale(1)" : "scale(0.9)",
          }}
          title="Envoyer (Entrée)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
