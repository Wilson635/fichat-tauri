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
    editingMessage?: MessageDto | null;
    onCancelEdit?: () => void;
}

function getExtension(f: string) { return f.split(".").pop()?.toLowerCase() ?? ""; }

function getDocAccent(ext: string): { bg: string; fg: string; label: string } {
    if (["doc", "docx"].includes(ext)) return { bg: "#2368c4", fg: "#fff", label: "WORD" };
    if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "#107c41", fg: "#fff", label: "XLS" };
    if (["ppt", "pptx"].includes(ext)) return { bg: "#d35230", fg: "#fff", label: "PPT" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { bg: "#78716c", fg: "#fff", label: "ZIP" };
    if (ext === "pdf") return { bg: "#ef4444", fg: "#fff", label: "PDF" };
    return { bg: "#64748b", fg: "#fff", label: ext.toUpperCase() || "DOC" };
}

// ─── Attachment type menu (WhatsApp style) ────────────────────────────────────
interface AttachmentMenuItem {
    icon: React.ReactNode;
    label: string;
    color: string;
    accept: string;
    capture?: string;
}

const ATTACHMENT_ITEMS: AttachmentMenuItem[] = [
    {
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        label: "Document",
        color: "#7c3aed",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar",
    },
    {
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
        label: "Photos et vidéos",
        color: "#8b5cf6",
        accept: "image/*,video/*",
    },
    {
        icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
        ),
        label: "Audio",
        color: "#f97316",
        accept: "audio/*",
    },
];

function AttachmentMenu({ onSelect, onClose }: {
    onSelect: (item: AttachmentMenuItem) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", esc);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute bottom-14 left-0 z-50 rounded-2xl shadow-xl overflow-hidden py-2"
            style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                minWidth: 200,
                animation: "slideUp 0.18s ease-out",
            }}
        >
            {ATTACHMENT_ITEMS.map((item, idx) => (
                <button
                    key={idx}
                    onClick={() => { onSelect(item); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                    style={{ color: "var(--color-text-primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-secondary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                    {/* Colored circle icon */}
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: item.color, color: "#fff" }}
                    >
                        {item.icon}
                    </div>
                    <span className="font-medium">{item.label}</span>
                </button>
            ))}
        </div>
    );
}

// ─── File preview before sending (WhatsApp style) ─────────────────────────────
function PendingFilePreview({ pendingFile, onRemove }: { pendingFile: PendingFile; onRemove: () => void }) {
    const { file, thumbnail } = pendingFile;
    const ext = getExtension(file.name);
    const accent = getDocAccent(ext);
    const mime = file.type;

    const RemoveBtn = () => (
        <button
            onClick={onRemove}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-md"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            title="Retirer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    );

    // ── Image ──
    if (isImage(mime) && thumbnail) {
        return (
            <div className="relative mb-2 rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "var(--color-border)", display: "inline-block", maxWidth: 260 }}>
                <RemoveBtn />
                <img src={thumbnail} alt={file.name} className="block object-cover" style={{ maxHeight: 200, minHeight: 80 }} />
                <div className="px-3 py-1.5 flex items-center gap-2" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    <span className="text-xs truncate flex-1 font-medium" style={{ color: "var(--color-text-muted)" }}>{file.name}</span>
                    <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</span>
                </div>
            </div>
        );
    }

    // ── Video ──
    if (isVideo(mime)) {
        return (
            <div className="relative mb-2 rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: "var(--color-border)", display: "inline-block", minWidth: 220 }}>
                <RemoveBtn />
                {thumbnail ? (
                    <>
                        <img src={thumbnail} alt="" className="block object-cover" style={{ maxHeight: 160, minWidth: 220 }} />
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
                            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                                <svg className="w-6 h-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: "var(--color-surface-secondary)", minWidth: 220 }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#8b5cf6", color: "#fff" }}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)", maxWidth: 160 }}>{file.name}</p>
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
                        </div>
                    </div>
                )}
                <div className="px-3 py-1.5" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{file.name} · {formatFileSize(file.size)}</p>
                </div>
            </div>
        );
    }

    // ── Audio ──
    if (isAudio(mime)) {
        return (
            <div className="relative flex items-center gap-3 mb-2 px-4 py-3 rounded-2xl border shadow-sm" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", minWidth: 240 }}>
                <RemoveBtn />
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-primary-500)" }}>
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                </div>
                <div className="flex items-center gap-px flex-1" style={{ height: 28 }}>
                    {Array.from({ length: 22 }).map((_, i) => {
                        const seed = (file.name.charCodeAt(i % file.name.length) + i * 7) % 10;
                        return (
                            <div key={i} className="flex-1 rounded-full" style={{ height: `${25 + seed * 7}%`, backgroundColor: "var(--color-primary-500)", opacity: 0.5 }} />
                        );
                    })}
                </div>
                <div className="min-w-0 shrink-0 ml-1">
                    <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatFileSize(file.size)}</p>
                </div>
            </div>
        );
    }

    // ── PDF ──
    if (isPdf(mime)) {
        return (
            <div className="relative mb-2 rounded-2xl overflow-hidden border shadow-sm" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", maxWidth: 280 }}>
                <RemoveBtn />
                {thumbnail ? (
                    <img src={thumbnail} alt="aperçu PDF" className="w-full object-cover object-top block" style={{ maxHeight: 140 }} />
                ) : (
                    <div className="flex items-center justify-center" style={{ height: 88, backgroundColor: "rgba(239,68,68,0.08)" }}>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: "#ef4444", fontSize: 14 }}>PDF</div>
                    </div>
                )}
                <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-xs" style={{ backgroundColor: "#ef4444" }}>PDF</div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>PDF · {formatFileSize(file.size)}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Generic document ──
    return (
        <div className="relative flex items-center gap-3 mb-2 px-4 py-3 rounded-2xl border shadow-sm" style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "var(--color-border)", maxWidth: 300 }}>
            <RemoveBtn />
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-xs" style={{ backgroundColor: accent.bg }}>
                {accent.label.slice(0, 4)}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{accent.label} · {formatFileSize(file.size)}</p>
            </div>
        </div>
    );
}

// ─── MessageInput ─────────────────────────────────────────────────────────────
export function MessageInput({ onSend, onSendFile, onTyping, replyTo, onCancelReply, disabled, editingMessage, onCancelEdit }: Props) {
    const [text, setText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileAccept, setFileAccept] = useState("*/*");
    const [fileCapture, setFileCapture] = useState<string | undefined>(undefined);
    const { theme } = useThemeStore();

    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    // Pre-fill text when editing
    useEffect(() => {
        if (editingMessage) {
            setText(editingMessage.content ?? "");
            inputRef.current?.focus();
        }
    }, [editingMessage]);

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
            if (editingMessage) onCancelEdit?.();
        }
        inputRef.current?.focus();
    }, [canSend, pendingFile, text, replyTo, editingMessage, onSend, onSendFile, onCancelReply, onCancelEdit]);

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        if (e.key === "Escape" && editingMessage) { onCancelEdit?.(); setText(""); }
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

    const handleAttachSelect = (item: AttachmentMenuItem) => {
        if (!item.accept) {
            // Sondage / Événement / Sticker — pas de fichier, future feature
            return;
        }
        setFileAccept(item.accept);
        setFileCapture(item.capture);
        // Small delay so the menu closes before the dialog opens
        setTimeout(() => fileInputRef.current?.click(), 80);
    };

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

            {/* ── Edit mode banner ──────────────────────────────────────────────── */}
            {editingMessage && (
                <div
                    className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border-l-4"
                    style={{ backgroundColor: "var(--color-surface-secondary)", borderColor: "#f59e0b" }}
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#f59e0b" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold block" style={{ color: "#f59e0b" }}>Modifier le message</span>
                        <span className="text-xs truncate block" style={{ color: "var(--color-text-muted)" }}>{editingMessage.content}</span>
                    </div>
                    <button onClick={() => { onCancelEdit?.(); setText(""); }} className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-border)" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--color-text-muted)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Reply preview ──────────────────────────────────────────────────── */}
            {replyTo && !editingMessage && (
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
                <div className="flex-1 flex items-end gap-1 rounded-2xl px-2 py-1.5" style={{ backgroundColor: "var(--color-surface)" }}>

                    {/* Attachment button with popup menu */}
                    <div className="relative self-end pb-0.5">
                        <button
                            onClick={() => { setShowAttachMenu((v) => !v); setShowEmoji(false); }}
                            disabled={disabled || fileLoading}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-all disabled:opacity-40"
                            style={{
                                color: showAttachMenu ? "var(--color-primary-500)" : "var(--color-text-muted)",
                                transform: showAttachMenu ? "rotate(45deg)" : "rotate(0deg)",
                                transition: "transform 0.2s ease, color 0.15s",
                            }}
                            title="Joindre"
                            type="button"
                        >
                            {fileLoading ? (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                        </button>

                        {showAttachMenu && (
                            <AttachmentMenu
                                onSelect={handleAttachSelect}
                                onClose={() => setShowAttachMenu(false)}
                            />
                        )}
                    </div>

                    {/* Emoji button */}
                    <div className="relative self-end pb-0.5">
                        <button
                            onClick={() => { setShowEmoji((v) => !v); setShowAttachMenu(false); }}
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
                        className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed py-1.5"
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
                        transform: canSend ? "scale(1)" : "scale(0.88)",
                    }}
                    title={editingMessage ? "Valider (Entrée)" : "Envoyer (Entrée)"}
                >
                    {editingMessage ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept={fileAccept}
                capture={fileCapture as any}
                className="hidden"
                onChange={handleFileChange}
            />

            <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
