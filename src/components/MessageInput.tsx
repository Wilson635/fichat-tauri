import { useState, useRef, useEffect, useCallback } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto } from "@/services/chatService";
import { formatFileSize, isImage, isVideo, isAudio, generateThumbnail } from "@/utils/fileUtils";
import { Icon } from "@/components/Icon";

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
    icon: React.ReactNode;
    label: string;
    color: string;
    accept: string;
    capture?: string;
}

const ATTACHMENT_ITEMS: AttachmentMenuItem[] = [
    {
        icon: <Icon name="file" size={18} />,
        label: "Document",
        color: "#6366F1",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar",
    },
    {
        icon: <Icon name="image" size={18} />,
        label: "Photos et vidéos",
        color: "#0EA5E9",
        accept: "image/*,video/*",
    },
    {
        icon: <Icon name="mic" size={18} />,
        label: "Audio",
        color: "#F59E0B",
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
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
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
        <div className="shrink-0 px-3 py-2" style={{ backgroundColor: "var(--color-header-bg)" }}>


            {/* ── Reply preview ──────────────────────────────────────────────────── */}
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
                    <button onClick={onCancelReply} className="icon-btn shrink-0" style={{ width: 28, height: 28 }}>
                        <Icon name="x" size={14} />
                    </button>
                </div>
            )}

            {/* ── Pending file preview ──────────────────────────────────────────── */}
            {pendingFile && (
                <PendingFilePreview pendingFile={pendingFile} onRemove={() => { setPendingFile(null); inputRef.current?.focus(); }} />
            )}

            {recordError && (
                <p className="text-xs mb-1 px-1" style={{ color: "#ef4444" }}>{recordError}</p>
            )}

            {recording ? (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={cancelRecording}
                        className="icon-btn shrink-0"
                        style={{ color: "#ef4444" }}
                        title="Annuler"
                    >
                        <Icon name="trash" size={18} />
                    </button>
                    <div className="flex-1 flex items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: "var(--color-surface)" }}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: "#ef4444" }} />
                        <span className="text-sm tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {Math.floor(recordSecs / 60)}:{(recordSecs % 60).toString().padStart(2, "0")}
                        </span>
                        <div className="flex-1 flex items-end gap-px h-7">
                            {levels.map((h, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-full"
                                    style={{ height: `${h}px`, backgroundColor: "var(--color-primary-500)", minHeight: 4 }}
                                />
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => finishRecording(true)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "var(--color-primary-500)", color: "#fff" }}
                        title="Envoyer le message vocal"
                    >
                        <Icon name="send" size={18} />
                    </button>
                </div>
            ) : (
            <div className="flex items-end gap-2">
                <div className="flex-1 flex items-end gap-1 rounded-xl px-2 py-1.5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>

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
                                <Icon name="loader" size={18} className="animate-spin" />
                            ) : (
                                <Icon name="plus" size={18} />
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
                            <Icon name="smile" size={18} />
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

                {/* Send or microphone */}
                {canSend ? (
                <button
                    onClick={send}
                    disabled={!canSend}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
                    style={{
                        backgroundColor: "var(--color-primary-500)",
                        color: "#fff",
                    }}
                    title="Envoyer (Entrée)"
                >
                    <Icon name="send" size={18} />
                </button>
                ) : (
                <button
                    type="button"
                    onClick={startRecording}
                    disabled={disabled}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
                    style={{
                        backgroundColor: "var(--color-primary-500)",
                        color: "#fff",
                    }}
                    title="Message vocal"
                >
                    <Icon name="mic" size={18} />
                </button>
                )}
            </div>
            )}

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
