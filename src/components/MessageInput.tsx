import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "@/store/themeStore";
import type { MessageDto } from "@/services/chatService";
import { generateThumbnail, readTextSnippet } from "@/utils/fileUtils";
import { Icon, type IconName } from "@/components/Icon";
import { SendFileOverlay, type PendingShare } from "@/components/SendFileOverlay";

interface Props {
    onSend: (content: string, replyToId?: number) => void;
    onSendFile?: (file: File, thumbnail: string | null, dataUrl: string, caption: string, replyToId?: number, messageType?: "voice" | "image" | "file" | "video") => void;
    onTyping: () => void;
    replyTo: MessageDto | null;
    onCancelReply: () => void;
    disabled?: boolean;
}

// ─── Attachment type menu ─────────────────────────────────────────────────────
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

// ─── MessageInput ─────────────────────────────────────────────────────────────
export function MessageInput({ onSend, onSendFile, onTyping, replyTo, onCancelReply, disabled }: Props) {
    const [text, setText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingFile, setPendingFile] = useState<PendingShare | null>(null);
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

    const clearPending = useCallback(() => {
        setPendingFile((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }, []);

    const send = useCallback(() => {
        if (!canSend) return;
        if (pendingFile) {
            onSendFile?.(pendingFile.file, pendingFile.thumbnail, pendingFile.dataUrl, text.trim(), replyTo?.id);
            if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
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
            const previewUrl = URL.createObjectURL(file);
            const [thumb, dataUrl, snippet] = await Promise.all([
                generateThumbnail(file, 600),
                fileToDataUrl(file),
                readTextSnippet(file),
            ]);
            setPendingFile((prev) => {
                if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
                return { file, thumbnail: thumb, dataUrl, previewUrl, textSnippet: snippet };
            });
        } catch (err) {
            console.error("Erreur lecture fichier:", err);
        } finally {
            setFileLoading(false);
        }
    };

    return (
        <div className="composer-wrap">
            {pendingFile && (
                <SendFileOverlay
                    pending={pendingFile}
                    onCancel={() => {
                        clearPending();
                        inputRef.current?.focus();
                    }}
                />
            )}
            <div
                className={`composer-card ${focused || showEmoji || showAttachMenu || recording || pendingFile ? "is-focused" : ""} ${disabled ? "is-disabled" : ""}`}
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
