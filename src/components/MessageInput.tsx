import { useState, useRef, useEffect, useCallback } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { formatFileSize, isImage, getFileColor, getFileExt, generateThumbnail } from "@/utils/fileUtils";

interface PendingFile {
  file: File;
  thumbnail: string | null; // data URL for preview (image or null)
  dataUrl: string;           // full data URL for sending
}

interface Props {
  onSend: (content: string, replyToId?: number) => void;
  onSendFile?: (file: File, thumbnail: string | null, dataUrl: string, caption: string, replyToId?: number) => void;
  onTyping: () => void;
  replyTo: MessageDto | null;
  onCancelReply: () => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onSendFile, onTyping, replyTo, onCancelReply, disabled }: Props) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useThemeStore();

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const canSend = !disabled && (text.trim().length > 0 || pendingFile !== null);

  const send = useCallback(() => {
    if (!canSend) return;

    if (pendingFile) {
      onSendFile?.(pendingFile.file, pendingFile.thumbnail, pendingFile.dataUrl, text.trim(), replyTo?.id);
      setPendingFile(null);
      setText("");
      onCancelReply();
    } else if (text.trim()) {
      onSend(text.trim(), replyTo?.id);
      setText("");
      onCancelReply();
    }
    inputRef.current?.focus();
  }, [canSend, pendingFile, text, replyTo, onSend, onSendFile, onCancelReply]);

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

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [text]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // ── File picker ──────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be picked again

    setFileLoading(true);
    try {
      const { fileToDataUrl } = await import("@/utils/fileUtils");
      const [thumb, dataUrl] = await Promise.all([
        generateThumbnail(file, 600),
        fileToDataUrl(file),
      ]);
      setPendingFile({ file, thumbnail: thumb, dataUrl });
    } catch (err) {
      console.error("Erreur lecture fichier:", err);
    } finally {
      setFileLoading(false);
    }
  };

  const removeFile = () => {
    setPendingFile(null);
    inputRef.current?.focus();
  };

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{ backgroundColor: "var(--color-header-bg)" }}
    >
      {/* ── Reply preview ───────────────────────────────────────────────────── */}
      {replyTo && (
        <div
          className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border-l-4"
          style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-primary-500)" }}
        >
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold block" style={{ color: "var(--color-primary-500)" }}>
              Répondre à {replyTo.senderName ?? "Moi"}
            </span>
            <span className="text-xs truncate block" style={{ color: "var(--color-text-muted)" }}>
              {replyTo.attachments?.length ? `📎 ${replyTo.attachments[0].fileName}` : replyTo.content}
            </span>
          </div>
          <button onClick={onCancelReply} className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-border)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Pending file preview ─────────────────────────────────────────────── */}
      {pendingFile && (
        <div
          className="flex items-center gap-3 mb-2 px-3 py-2 rounded-xl border"
          style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)" }}
        >
          {isImage(pendingFile.file.type) && pendingFile.thumbnail ? (
            <img
              src={pendingFile.thumbnail}
              alt=""
              className="w-12 h-12 object-cover rounded-lg shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: getFileColor(pendingFile.file.type) }}
            >
              {getFileExt(pendingFile.file.name, pendingFile.file.type)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {pendingFile.file.name}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {formatFileSize(pendingFile.file.size)}
            </p>
          </div>
          <button
            onClick={removeFile}
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 hover:opacity-80"
            style={{ backgroundColor: "var(--color-border)" }}
            title="Retirer la pièce jointe"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Main input row ────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-2">
        <div
          className="flex-1 flex items-end gap-1 rounded-2xl px-2 py-2"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          {/* Attachment button */}
          <div className="self-end pb-0.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || fileLoading}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-40"
              style={{ color: pendingFile ? "var(--color-primary-500)" : "var(--color-text-muted)" }}
              title="Joindre un fichier"
              type="button"
            >
              {fileLoading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
          </div>

          {/* Emoji button */}
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
              <div className="absolute bottom-10 left-0 z-50" onMouseDown={(e) => e.preventDefault()}>
                <Picker data={data} onEmojiSelect={addEmoji} theme={isDark ? "dark" : "light"} locale="fr" previewPosition="none" skinTonePosition="none" />
              </div>
            )}
          </div>

          {/* Text area */}
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            disabled={disabled}
            rows={1}
            placeholder={pendingFile ? "Ajouter une légende… (optionnel)" : "Écrivez un message…"}
            className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed py-1"
            style={{ color: "var(--color-text-primary)", maxHeight: 120 }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={send}
          disabled={!canSend}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{
            backgroundColor: canSend ? "var(--color-primary-500)" : "var(--color-surface-secondary)",
            color: canSend ? "#fff" : "var(--color-text-muted)",
            transform: canSend ? "scale(1)" : "scale(0.9)",
          }}
          title="Envoyer (Entrée)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
