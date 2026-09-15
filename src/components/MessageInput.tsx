import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto } from "@/services/chatService";
import { formatFileSize, isImage, isVideo, isAudio, generateThumbnail } from "@/utils/fileUtils";
import { Icon, type IconName } from "@/components/Icon";

interface PendingFile {
    file: File;
    thumbnail: string | null;
    dataUrl: string;
}

interface Props {
    onSend: (content: string, replyToId?: number) => void;
    onSendFile?: (file: File, thumbnail: string | null, dataUrl: string, caption: string, replyToId?: number, messageType?: "voice" | "image" | "file" | "video") => void;
    onTyping: () => void;
    replyTo: MessageDto | null;
    onCancelReply: () => void;
    disabled?: boolean;
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
    icon: IconName;
    label: string;
    hint: string;
    accept: string;
    capture?: string;
}

const ATTACHMENT_ITEMS: AttachmentMenuItem[] = [
    {
        icon: "file",
        label: "Document",
        hint: "PDF, Word, Excel, ZIP…",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar",
    },
    {
        icon: "image",
        label: "Photos et vidéos",
        hint: "Images, captures d’écran, films",
        accept: "image/*,video/*",
    },
    {
        icon: "mic",
        label: "Audio",
        hint: "Fichier son à partager",
        accept: "audio/*",
    },
];

function FloatingPanel({
    anchorRef,
    children,
    onClose,
}: {
    anchorRef: RefObject<HTMLElement | null>;
    children: ReactNode;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ bottom: 16, left: 16 });

    useLayoutEffect(() => {
        const place = () => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const left = Math.max(12, Math.min(r.left, window.innerWidth - 372));
            setPos({ bottom: window.innerHeight - r.top + 10, left });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [anchorRef]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t)) return;
            if (anchorRef.current?.contains(t)) return;
            onClose();
        };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", esc);
        };
    }, [onClose, anchorRef]);

    return createPortal(
        <div
            ref={panelRef}
            style={{ position: "fixed", bottom: pos.bottom, left: pos.left, zIndex: 80 }}
        >
            {children}
        </div>,
        document.body,
    );
}

function AttachmentMenu({ onSelect, onClose }: {
    onSelect: (item: AttachmentMenuItem) => void;
    onClose: () => void;
}) {
    return (
        <div className="fichat-popover">
            <div className="fichat-popover-head">
                <div className="icon-well">
                    <Icon name="paperclip" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3>Joindre un fichier</h3>
                    <p>Stocké de façon sécurisée côté serveur</p>
                </div>
                <button type="button" className="icon-btn shrink-0" onClick={onClose} title="Fermer">
                    <Icon name="x" size={15} />
                </button>
            </div>
            <div className="fichat-attach-list">
                {ATTACHMENT_ITEMS.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        onClick={() => { onSelect(item); onClose(); }}
                        className="fichat-attach-item"
                    >
                        <div className="icon-well">
                            <Icon name={item.icon} size={18} />
                        </div>
                        <span className="min-w-0">
                            <span className="title block">{item.label}</span>
                            <span className="hint block">{item.hint}</span>
                        </span>
                        <Icon name="chevronRight" size={16} style={{ color: "var(--color-text-muted)" }} className="shrink-0 ml-auto" />
                    </button>
                ))}
            </div>
            <p className="fichat-popover-foot">PDF, images, vidéos, vocaux et documents bureautiques.</p>
        </div>
    );
}

function EmojiPanel({
    isDark,
    onSelect,
    onClose,
}: {
    isDark: boolean;
    onSelect: (emoji: { native?: string }) => void;
    onClose: () => void;
}) {
    return (
        <div className="fichat-popover is-emoji fichat-emoji-panel">
            <div className="fichat-popover-head">
                <div className="icon-well">
                    <Icon name="smile" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3>Émojis</h3>
                    <p>Rechercher ou parcourir les catégories</p>
                </div>
                <button type="button" className="icon-btn shrink-0" onClick={onClose} title="Fermer">
                    <Icon name="x" size={15} />
                </button>
            </div>
            <div onMouseDown={(e) => e.preventDefault()}>
                <Picker
                    data={data}
                    onEmojiSelect={onSelect}
                    theme={isDark ? "dark" : "light"}
                    locale="fr"
                    previewPosition="none"
                    skinTonePosition="search"
                    navPosition="bottom"
                    searchPosition="sticky"
                    maxFrequentRows={1}
                    perLine={8}
                />
            </div>
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
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center z-10"
            style={{ backgroundColor: "rgba(15,23,42,0.72)", color: "#fff" }}
            title="Retirer"
        >
            <Icon name="x" size={14} />
        </button>
    );

    // ── Image ──
    if (isImage(mime) && thumbnail) {
        return (
            <div className="relative mb-0 rounded-2xl overflow-hidden border" style={{ borderColor: "var(--color-border)", display: "inline-block", maxWidth: 260 }}>
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

    // ── Document (PDF, Office, etc.) ──
    return (
        <div className="relative flex items-center gap-3 mb-2 px-3 py-2.5 rounded-xl border" style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)", maxWidth: 300 }}>
            <RemoveBtn />
            <div className="w-9 h-11 rounded-md flex items-center justify-center shrink-0 font-bold text-white text-[9px] tracking-wide" style={{ backgroundColor: accent.bg }}>
                {accent.label.slice(0, 4)}
            </div>
            <div className="flex-1 min-w-0 pr-6">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{file.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{accent.label} · {formatFileSize(file.size)}</p>
            </div>
        </div>
    );
}

// ─── MessageInput ─────────────────────────────────────────────────────────────
export function MessageInput({ onSend, onSendFile, onTyping, replyTo, onCancelReply, disabled }: Props) {
    const [text, setText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachBtnRef = useRef<HTMLButtonElement>(null);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const [fileAccept, setFileAccept] = useState("*/*");
    const [fileCapture, setFileCapture] = useState<string | undefined>(undefined);
    const [recording, setRecording] = useState(false);
    const [recordSecs, setRecordSecs] = useState(0);
    const [recordError, setRecordError] = useState<string | null>(null);
    const recordSecsRef = useRef(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordChunksRef = useRef<Blob[]>([]);
    const recordStreamRef = useRef<MediaStream | null>(null);
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const [levels, setLevels] = useState<number[]>(() => Array(24).fill(8));
    const rafRef = useRef<number | null>(null);
    const { theme } = useThemeStore();

    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const [focused, setFocused] = useState(false);

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

    const stopStream = useCallback(() => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        if (recordTimerRef.current) {
            clearInterval(recordTimerRef.current);
            recordTimerRef.current = null;
        }
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        analyserRef.current = null;
    }, []);

    const cancelRecording = useCallback(() => {
        try { mediaRecorderRef.current?.stop(); } catch {}
        mediaRecorderRef.current = null;
        recordChunksRef.current = [];
        stopStream();
        setRecording(false);
        recordSecsRef.current = 0;
        setRecordSecs(0);
    }, [stopStream]);

    const finishRecording = useCallback(async (sendIt: boolean) => {
        const recorder = mediaRecorderRef.current;
        mediaRecorderRef.current = null;
        if (recorder && recorder.state !== "inactive") {
            await new Promise<void>((resolve) => {
                recorder.addEventListener("stop", () => resolve(), { once: true });
                try { recorder.requestData(); } catch { /* ignore */ }
                try { recorder.stop(); } catch { resolve(); }
            });
        }
        const chunks = recordChunksRef.current;
        const mime = recorder?.mimeType || "audio/webm";
        const recordedSecs = Math.max(1, recordSecsRef.current);
        stopStream();
        setRecording(false);
        recordSecsRef.current = 0;
        setRecordSecs(0);
        recordChunksRef.current = [];
        if (!sendIt || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 400) return;
        const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `message-vocal-${recordedSecs}s-${Date.now()}.${ext}`, { type: mime || "audio/webm" });
        const { fileToDataUrl } = await import("@/utils/fileUtils");
        const dataUrl = await fileToDataUrl(file);
        onSendFile?.(file, null, dataUrl, "", replyTo?.id, "voice");
        onCancelReply();
    }, [onSendFile, onCancelReply, replyTo, stopStream]);

    const startRecording = useCallback(async () => {
        setRecordError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
            setRecordError("Enregistrement audio non supporté");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordStreamRef.current = stream;
            const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "";
            const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            recordChunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
            };
            recorder.onstop = () => {};
            mediaRecorderRef.current = recorder;
            recorder.start(100);
            setRecording(true);
            recordSecsRef.current = 0;
            setRecordSecs(0);
            recordTimerRef.current = setInterval(() => {
                recordSecsRef.current += 1;
                const s = recordSecsRef.current;
                setRecordSecs(s);
                if (s >= 300) {
                    finishRecording(true).catch(() => {});
                }
            }, 1000);

            try {
                const ctx = new AudioContext();
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 64;
                source.connect(analyser);
                analyserRef.current = analyser;
                const data = new Uint8Array(analyser.frequencyBinCount);
                const tick = () => {
                    analyser.getByteFrequencyData(data);
                    const bars = Array.from({ length: 24 }, (_, i) => {
                        const v = data[Math.floor((i / 24) * data.length)] ?? 0;
                        return 6 + (v / 255) * 22;
                    });
                    setLevels(bars);
                    rafRef.current = requestAnimationFrame(tick);
                };
                tick();
            } catch {}
        } catch {
            setRecordError("Microphone refusé ou indisponible");
        }
    }, [finishRecording]);

    useEffect(() => () => {
        try { mediaRecorderRef.current?.stop(); } catch {}
        stopStream();
    }, [stopStream]);

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
        <div className="composer-wrap">
            <div
                className={`composer-card ${focused || showEmoji || showAttachMenu || recording ? "is-focused" : ""} ${disabled ? "is-disabled" : ""}`}
            >
                {replyTo && (
                    <div className="composer-reply">
                        <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold block" style={{ color: "var(--color-primary-500)" }}>
                                Répondre à {replyTo.senderName ?? "Moi"}
                            </span>
                            <span className="text-[12px] truncate block" style={{ color: "var(--color-text-muted)" }}>
                                {replyTo.attachments?.length ? `📎 ${replyTo.attachments[0].fileName}` : replyTo.content}
                            </span>
                        </div>
                        <button type="button" onClick={onCancelReply} className="icon-btn shrink-0" style={{ width: 28, height: 28 }} title="Annuler la réponse">
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                )}

                {pendingFile && (
                    <div className="composer-attach">
                        <PendingFilePreview pendingFile={pendingFile} onRemove={() => { setPendingFile(null); inputRef.current?.focus(); }} />
                    </div>
                )}

                {recordError && (
                    <p className="text-[12px] px-3.5 pt-2" style={{ color: "#ef4444" }}>{recordError}</p>
                )}

                {recording ? (
                    <div className="composer-record">
                        <button
                            type="button"
                            onClick={cancelRecording}
                            className="icon-btn shrink-0"
                            style={{ color: "#ef4444" }}
                            title="Annuler"
                        >
                            <Icon name="trash" size={17} />
                        </button>
                        <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: "#ef4444" }} />
                        <span className="text-[13px] tabular-nums font-semibold" style={{ color: "var(--color-text-primary)" }}>
                            {Math.floor(recordSecs / 60)}:{(recordSecs % 60).toString().padStart(2, "0")}
                        </span>
                        <div className="flex-1 flex items-end gap-px h-7 min-w-0">
                            {levels.map((h, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-full"
                                    style={{ height: `${h}px`, backgroundColor: "var(--color-primary-500)", minHeight: 4 }}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => finishRecording(true)}
                            className="composer-send"
                            title="Envoyer le message vocal"
                        >
                            <Icon name="send" size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={handleChange}
                            onKeyDown={handleKey}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            disabled={disabled}
                            rows={1}
                            placeholder={pendingFile ? "Ajouter une légende… (optionnel)" : "Écrivez un message…"}
                            className="composer-field"
                            style={{ maxHeight: 140 }}
                        />

                        <div className="composer-toolbar">
                            <button
                                ref={attachBtnRef}
                                type="button"
                                onClick={() => { setShowAttachMenu((v) => !v); setShowEmoji(false); }}
                                disabled={disabled || fileLoading}
                                className={`composer-tool ${showAttachMenu ? "is-on" : ""}`}
                                title="Joindre un fichier"
                            >
                                {fileLoading ? (
                                    <Icon name="loader" size={18} className="animate-spin" />
                                ) : (
                                    <Icon name="paperclip" size={18} />
                                )}
                            </button>
                            {showAttachMenu && (
                                <FloatingPanel
                                    anchorRef={attachBtnRef}
                                    onClose={() => setShowAttachMenu(false)}
                                >
                                    <AttachmentMenu
                                        onSelect={handleAttachSelect}
                                        onClose={() => setShowAttachMenu(false)}
                                    />
                                </FloatingPanel>
                            )}

                            <button
                                ref={emojiBtnRef}
                                type="button"
                                onClick={() => { setShowEmoji((v) => !v); setShowAttachMenu(false); }}
                                className={`composer-tool ${showEmoji ? "is-on" : ""}`}
                                title="Émojis"
                            >
                                <Icon name="smile" size={18} />
                            </button>
                            {showEmoji && (
                                <FloatingPanel
                                    anchorRef={emojiBtnRef}
                                    onClose={() => setShowEmoji(false)}
                                >
                                    <EmojiPanel
                                        isDark={isDark}
                                        onSelect={addEmoji}
                                        onClose={() => setShowEmoji(false)}
                                    />
                                </FloatingPanel>
                            )}

                            <span className="composer-hint">
                                {canSend ? "Entrée pour envoyer" : "Maj+Entrée : nouvelle ligne"}
                            </span>

                            {canSend ? (
                                <button
                                    type="button"
                                    onClick={send}
                                    className="composer-send"
                                    title="Envoyer (Entrée)"
                                >
                                    <Icon name="send" size={16} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={startRecording}
                                    disabled={disabled}
                                    className="composer-send is-mic"
                                    title="Message vocal"
                                >
                                    <Icon name="mic" size={16} />
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept={fileAccept}
                capture={fileCapture as any}
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
}
