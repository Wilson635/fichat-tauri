import { useState, useRef, useEffect, useCallback } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto } from "@/services/chatService";
import { formatFileSize, isImage, isVideo, isAudio, isPdf, generateThumbnail } from "@/utils/fileUtils";

interface PendingFile {
    file: File;
    thumbnail: string | null;
    dataUrl: string;
}

interface Props {
    onSend: (content: string, replyToId?: number) => void;
    onSendFile?: (file: File, thumbnail: string | null, dataUrl: string, caption: string, replyToId?: number) => void;
    onTyping: () => void;
    replyTo: MessageDto | null;
    onCancelReply: () => void;
    disabled?: boolean;
}

// ─── Helpers partagés avec MessageBubble ─────────────────────────────────────
function getExtension(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getDocAccent(ext: string): { bg: string; fg: string } {
    if (["doc", "docx"].includes(ext)) return { bg: "rgba(59,130,246,0.15)", fg: "#3b82f6" };
    if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "rgba(34,197,94,0.15)", fg: "#22c55e" };
    if (["ppt", "pptx"].includes(ext)) return { bg: "rgba(249,115,22,0.15)", fg: "#f97316" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { bg: "rgba(168,85,247,0.15)", fg: "#a855f7" };
    if (ext === "pdf") return { bg: "rgba(239,68,68,0.15)", fg: "#ef4444" };
    return { bg: "rgba(100,116,139,0.15)", fg: "#64748b" };
}

// ─── Preview avant envoi ──────────────────────────────────────────────────────
function PendingFilePreview({ pendingFile, onRemove }: { pendingFile: PendingFile; onRemove: () => void }) {
    const { file, thumbnail } = pendingFile;
    const ext = getExtension(file.name);
    const accent = getDocAccent(ext);
    const mime = file.type;

    const RemoveBtn = () => (
        <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            title="Retirer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    );

    // ── Image ──
    if (isImage(mime) && thumbnail) {
        return (
            <div
                className="relative inline-block mb-2 rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)" }}
            >
                <RemoveBtn />
                <img
                    src={thumbnail}
                    alt={file.name}
                    className="block object-cover rounded-xl"
                    style={{ maxHeight: 160, maxWidth: 240 }}
                />
            </div>
        );
    }

    // ── Vidéo ──
    if (isVideo(mime)) {
        return (
            <div
                className="relative mb-2 rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)", display: "inline-block" }}
            >
                <RemoveBtn />
                {thumbnail ? (
                    <>
                        <img src={thumbnail} alt="" className="block object-cover" style={{ maxHeight: 140, maxWidth: 220 }} />
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                                <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                        </div>
                    </>
                ) : (
                    <div
                        className="flex items-center gap-3 px-3 py-2.5"
                        style={{ backgroundColor: "var(--color-surface-secondary)", minWidth: 200 }}
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
                        </div>
                    </div>
                )}
                <div className="px-2 pb-1.5 pt-1 text-xs" style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-surface-secondary)" }}>
                    {file.name} · {formatFileSize(file.size)}
                </div>
            </div>
        );
    }

    // ── Audio ──
    if (isAudio(mime)) {
        return (
            <div
                className="relative flex items-center gap-3 mb-2 px-3 py-2.5 rounded-xl border"
                style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", minWidth: 220 }}
            >
                <RemoveBtn />
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-primary-500)" }}>
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
                {/* Fake waveform */}
                <div className="flex items-center gap-px flex-1" style={{ height: 28 }}>
                    {Array.from({ length: 22 }).map((_, i) => {
                        const seed = (file.name.charCodeAt(i % file.name.length) + i * 7) % 10;
                        const h = 25 + seed * 7;
                        return (
                            <div
                                key={i}
                                className="flex-1 rounded-full"
                                style={{ height: `${h}%`, backgroundColor: "var(--color-border)" }}
                            />
                        );
                    })}
                </div>
                <div className="ml-1 min-w-0 shrink-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)", maxWidth: 90 }}>{file.name}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
                </div>
            </div>
        );
    }

    // ── PDF ──
    if (isPdf(mime)) {
        return (
            <div
                className="relative flex flex-col mb-2 rounded-xl overflow-hidden border"
                style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", maxWidth: 240 }}
            >
                <RemoveBtn />
                {thumbnail ? (
                    <img src={thumbnail} alt="aperçu PDF" className="w-full object-cover object-top block" style={{ maxHeight: 120 }} />
                ) : (
                    <div className="flex items-center justify-center" style={{ height: 72, backgroundColor: "var(--color-border)" }}>
                        <span className="text-xs font-bold" style={{ color: accent.fg }}>PDF</span>
                    </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: accent.bg, color: accent.fg }}>
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Document générique ──
    return (
        <div
            className="relative flex items-center gap-3 mb-2 px-3 py-2.5 rounded-xl border"
            style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", maxWidth: 280 }}
        >
            <RemoveBtn />
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accent.bg, color: accent.fg }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
            </div>
        </div>
    );
}

// ─── MessageInput ─────────────────────────────────────────────────────────────
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
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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

    useEffect(() => { if (replyTo) inputRef.current?.focus(); }, [replyTo]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
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

    return (
        <div className="shrink-0 px-3 py-2" style={{ backgroundColor: "var(--color-header-bg)" }}>

            {/* ── Reply preview ─────────────────────────────────────────────────── */}
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

            {/* ── Pending file preview ──────────────────────────────────────────── */}
            {pendingFile && (
                <PendingFilePreview pendingFile={pendingFile} onRemove={() => { setPendingFile(null); inputRef.current?.focus(); }} />
            )}

            {/* ── Main input row ────────────────────────────────────────────────── */}
            <div className="flex items-end gap-2">
                <div className="flex-1 flex items-end gap-1 rounded-2xl px-2 py-2" style={{ backgroundColor: "var(--color-surface)" }}>

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

                    {/* Textarea */}
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
            <input ref={fileInputRef} type="file" accept="*/*" className="hidden" onChange={handleFileChange} />
        </div>
    );
}