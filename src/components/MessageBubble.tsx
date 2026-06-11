import { useState, useRef, useEffect, useCallback } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { useAuthStore } from "@/store/authStore";
import { formatFileSize, isImage, isVideo, isAudio } from "@/utils/fileUtils";

export function formatDateSeparator(iso: string): string {
    const d = new Date(iso);
    if (isToday(d)) return "Aujourd'hui";
    if (isYesterday(d)) return "Hier";
    return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

function formatMsgTime(iso: string): string {
    return format(new Date(iso), "HH:mm");
}

// ─── Status ticks (WhatsApp style) ────────────────────────────────────────────
function StatusIcon({ status }: { status: MessageDto["status"] }) {
    if (status === "sending") return (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ opacity: 0.5 }}>
            <circle cx="12" cy="12" r="10" />
        </svg>
    );
    if (status === "sent") return (
        <svg className="w-3.5 h-3" viewBox="0 0 16 11" fill="currentColor" style={{ opacity: 0.65 }}>
            <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
        </svg>
    );
    if (status === "delivered") return (
        <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ opacity: 0.65 }}>
            <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
            <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
        </svg>
    );
    if (status === "read") return (
        <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ color: "rgba(255,255,255,0.85)" }}>
            <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
            <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
        </svg>
    );
    return null;
}

// ─── File type helpers ────────────────────────────────────────────────────────
function getExtension(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getDocAccent(ext: string): { bg: string; fg: string; label: string } {
    if (["doc", "docx"].includes(ext)) return { bg: "#2368c4", fg: "#fff", label: "WORD" };
    if (["xls", "xlsx", "csv"].includes(ext)) return { bg: "#107c41", fg: "#fff", label: "EXCEL" };
    if (["ppt", "pptx"].includes(ext)) return { bg: "#d35230", fg: "#fff", label: "PPT" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { bg: "#78716c", fg: "#fff", label: "ZIP" };
    if (ext === "pdf") return { bg: "#ef4444", fg: "#fff", label: "PDF" };
    return { bg: "#64748b", fg: "#fff", label: ext.toUpperCase() || "DOC" };
}

// ─── Circular file icon badge (WhatsApp style) ────────────────────────────────
function FileTypeBadge({ ext, size = 40 }: { ext: string; size?: number }) {
    const accent = getDocAccent(ext);
    return (
        <div
            className="rounded-full flex items-center justify-center shrink-0 font-bold"
            style={{ width: size, height: size, backgroundColor: accent.bg, color: accent.fg, fontSize: size * 0.24 }}
        >
            {accent.label.slice(0, 4)}
        </div>
    );
}

// ─── WhatsApp-style document card ─────────────────────────────────────────────
function DocCard({
                     attachment, isOwn, onOpen,
                 }: { attachment: AttachmentDto; isOwn: boolean; onOpen: () => void }) {
    const ext = getExtension(attachment.fileName);
    const accent = getDocAccent(ext);
    const [thumbErr, setThumbErr] = useState(false);

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        const a = document.createElement("a");
        a.href = attachment.filePath || "";
        a.download = attachment.fileName;
        a.click();
    };

    return (
        <div className="w-full" style={{ minWidth: 240, maxWidth: 300 }}>
            {/* Thumbnail preview (top section) */}
            {attachment.thumbnail && !thumbErr ? (
                <div className="w-full overflow-hidden rounded-t-xl" style={{ maxHeight: 160 }}>
                    <img
                        src={attachment.thumbnail}
                        alt="aperçu"
                        className="w-full object-cover object-top block"
                        style={{ maxHeight: 160 }}
                        onError={() => setThumbErr(true)}
                    />
                </div>
            ) : (
                <div
                    className="w-full flex items-center justify-center rounded-t-xl"
                    style={{
                        height: 100,
                        backgroundColor: isOwn ? "rgba(0,0,0,0.15)" : "var(--color-surface-secondary)",
                    }}
                >
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg"
                        style={{ backgroundColor: accent.bg, color: accent.fg }}
                    >
                        {accent.label.slice(0, 4)}
                    </div>
                </div>
            )}

            {/* Info row */}
            <div className="flex items-center gap-3 px-3 py-2.5">
                <FileTypeBadge ext={ext} size={38} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate" style={{ color: isOwn ? "#fff" : "var(--color-text-primary)" }}>
                        {attachment.fileName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: isOwn ? "rgba(255,255,255,0.65)" : "var(--color-text-muted)" }}>
                        {ext.toUpperCase()} · {formatFileSize(attachment.fileSize)}
                    </p>
                </div>
            </div>

            {/* Action buttons (WhatsApp style — green links) */}
            <div
                className="flex border-t"
                style={{ borderColor: isOwn ? "rgba(255,255,255,0.18)" : "var(--color-border)" }}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); onOpen(); }}
                    className="flex-1 py-2 text-xs font-semibold text-center transition-opacity hover:opacity-80"
                    style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)" }}
                >
                    Ouvrir
                </button>
                <div className="w-px" style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.18)" : "var(--color-border)" }} />
                <button
                    onClick={handleSave}
                    className="flex-1 py-2 text-xs font-semibold text-center transition-opacity hover:opacity-80"
                    style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)" }}
                >
                    Enregistrer sous…
                </button>
            </div>
        </div>
    );
}

// ─── Audio player ─────────────────────────────────────────────────────────────
function AudioPlayer({ attachment, isOwn }: { attachment: AttachmentDto; isOwn: boolean }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    const toggle = () => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else { a.play(); setPlaying(true); }
    };

    const fmt = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
    };

    return (
        <div className="flex items-center gap-3 px-3 py-2.5" style={{ minWidth: 220, maxWidth: 280 }}>
            <audio
                ref={audioRef}
                src={attachment.filePath}
                onTimeUpdate={() => {
                    const a = audioRef.current;
                    if (a && a.duration) setProgress(a.currentTime / a.duration);
                }}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                onEnded={() => { setPlaying(false); setProgress(0); }}
            />
            <button
                onClick={toggle}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
                style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.22)" : "var(--color-primary-500)", color: "#fff" }}
            >
                {playing
                    ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    : <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                }
            </button>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-px h-6">
                    {Array.from({ length: 28 }).map((_, i) => {
                        const seed = (attachment.fileName.charCodeAt(i % attachment.fileName.length) + i * 7) % 10;
                        const h = 25 + seed * 7;
                        const filled = i / 28 <= progress;
                        return (
                            <div key={i} className="flex-1 rounded-full transition-colors"
                                 style={{
                                     height: `${h}%`,
                                     backgroundColor: filled
                                         ? (isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)")
                                         : (isOwn ? "rgba(255,255,255,0.35)" : "var(--color-border)"),
                                 }}
                            />
                        );
                    })}
                </div>
                <span className="text-xs" style={{ opacity: 0.6, fontSize: 10 }}>
          {playing ? fmt(audioRef.current?.currentTime ?? 0) : fmt(duration)}
        </span>
            </div>
        </div>
    );
}

// ─── Video preview ────────────────────────────────────────────────────────────
function VideoPreview({ attachment, isOwn, onOpen }: { attachment: AttachmentDto; isOwn: boolean; onOpen: () => void }) {
    const [imgError, setImgError] = useState(false);

    if (attachment.thumbnail && !imgError) {
        return (
            <button onClick={onOpen} className="relative block w-full overflow-hidden rounded-xl focus:outline-none" style={{ maxHeight: 220 }}>
                <img src={attachment.thumbnail} alt={attachment.fileName} className="w-full object-cover block" style={{ maxHeight: 220 }} onError={() => setImgError(true)} />
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.28)" }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                        <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                </div>
            </button>
        );
    }

    return (
        <button onClick={onOpen} className="flex items-center gap-3 px-3 py-2.5 focus:outline-none" style={{ minWidth: 200 }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.22)" : "var(--color-primary-500)", color: "#fff" }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
            </div>
        </button>
    );
}

// ─── Image (single) ───────────────────────────────────────────────────────────
function ImageAttachment({ attachment, isOwn, onOpen }: { attachment: AttachmentDto; isOwn: boolean; onOpen: () => void }) {
    const [imgError, setImgError] = useState(false);

    if (imgError) {
        return (
            <div className="flex items-center justify-center w-48 h-32 rounded-xl" style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
        );
    }

    const src = attachment.thumbnail || attachment.filePath;
    return (
        <button onClick={onOpen} className="block w-full overflow-hidden rounded-xl focus:outline-none" style={{ maxWidth: 300 }}>
            {src ? (
                <img src={src} alt={attachment.fileName} className="w-full object-cover block" style={{ maxHeight: 260 }} onError={() => setImgError(true)} />
            ) : (
                <div className="w-48 h-32 flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            )}
        </button>
    );
}

// ─── Attachment dispatcher ────────────────────────────────────────────────────
function AttachmentView({
                            attachment, isOwn, onOpen,
                        }: { attachment: AttachmentDto; isOwn: boolean; onOpen: (a: AttachmentDto) => void }) {
    if (isImage(attachment.fileType)) {
        return <ImageAttachment attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }
    if (isVideo(attachment.fileType)) {
        return <VideoPreview attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }
    if (isAudio(attachment.fileType)) {
        return <AudioPlayer attachment={attachment} isOwn={isOwn} />;
    }
    return <DocCard attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
}

// ─── Context menu ─────────────────────────────────────────────────────────────
interface CtxMenu {
    x: number;
    y: number;
}

interface CtxMenuProps {
    pos: CtxMenu;
    isOwn: boolean;
    hasText: boolean;
    onClose: () => void;
    onReply: () => void;
    onCopy: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function ContextMenu({ pos, isOwn, hasText, onClose, onReply, onCopy, onEdit, onDelete }: CtxMenuProps) {
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

    // Adjust position to stay in viewport
    const menuW = 200;
    const menuH = 160;
    const left = Math.min(pos.x, window.innerWidth - menuW - 8);
    const top = Math.min(pos.y, window.innerHeight - menuH - 8);

    const items = [
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
            ),
            label: "Répondre",
            action: () => { onReply(); onClose(); },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            label: "Copier le texte",
            action: () => { onCopy(); onClose(); },
            show: hasText,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            ),
            label: "Modifier",
            action: () => { onEdit(); onClose(); },
            show: isOwn && hasText,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            ),
            label: "Supprimer",
            action: () => { onDelete(); onClose(); },
            show: isOwn,
            danger: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            ),
            label: "Fermer",
            action: onClose,
            show: true,
        },
    ];

    return (
        <div
            ref={ref}
            className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden py-1"
            style={{
                left,
                top,
                minWidth: menuW,
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {items.filter((i) => i.show).map((item, idx) => (
                <button
                    key={idx}
                    onClick={item.action}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: item.danger ? "#ef4444" : "var(--color-text-primary)" }}
                >
                    <span style={{ color: item.danger ? "#ef4444" : "var(--color-text-muted)" }}>{item.icon}</span>
                    {item.label}
                </button>
            ))}
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
    message: MessageDto;
    showSenderName: boolean;
    onReply: (msg: MessageDto) => void;
    onEdit?: (msg: MessageDto) => void;
    onDelete?: (msg: MessageDto) => void;
    onOpenPreview?: (att: AttachmentDto) => void;
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
export function MessageBubble({ message, showSenderName, onReply, onEdit, onDelete, onOpenPreview }: Props) {
    const { user } = useAuthStore();
    const isOwn = message.senderId === user?.id;
    const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
    const [hovered, setHovered] = useState(false);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const handleCopy = useCallback(() => {
        if (message.content) navigator.clipboard.writeText(message.content).catch(() => {});
    }, [message.content]);

    // ── System message ──
    if (message.messageType === "system") {
        return (
            <div className="flex justify-center my-1.5 px-4">
        <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
          {message.content}
        </span>
            </div>
        );
    }

    // ── Deleted message ──
    if (message.isDeleted) {
        return (
            <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-0.5 px-3`}>
                <div className="px-3 py-2 rounded-xl text-sm italic max-w-xs flex items-center gap-2" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" /></svg>
                    Message supprimé
                </div>
            </div>
        );
    }

    const initials = (message.senderName ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const hue = (message.senderName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

    const hasText = !!message.content?.trim();
    const atts = message.attachments ?? [];
    const hasOnlyMedia = atts.length > 0 && !hasText && (isImage(atts[0]?.fileType) || isVideo(atts[0]?.fileType));

    // WhatsApp bubble colors
    const ownBg = "var(--color-primary-500)";
    const otherBg = "var(--color-surface)";

    return (
        <>
            <div
                className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-0.5 px-2`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {/* Avatar for others */}
                {!isOwn && (
                    <div className="flex flex-col justify-end mr-1.5 mb-1 shrink-0">
                        <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
                        >
                            {initials}
                        </div>
                    </div>
                )}

                <div className={`flex flex-col max-w-[72%] ${isOwn ? "items-end" : "items-start"}`}>
                    {/* Sender name */}
                    {showSenderName && !isOwn && (
                        <span className="text-xs font-semibold mb-0.5 ml-2" style={{ color: `hsl(${hue}, 55%, 45%)` }}>
              {message.senderName}
            </span>
                    )}

                    <div className="relative flex items-end gap-1.5">
                        {/* Reply button for own messages */}
                        {isOwn && hovered && (
                            <button
                                onClick={() => onReply(message)}
                                className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-100"
                                style={{ backgroundColor: "var(--color-surface-secondary)", opacity: 0.85 }}
                                title="Répondre"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </button>
                        )}

                        {/* ── Bubble ── */}
                        <div
                            className="relative overflow-hidden"
                            style={{
                                backgroundColor: isOwn ? ownBg : otherBg,
                                borderRadius: isOwn
                                    ? "16px 16px 4px 16px"
                                    : "16px 16px 16px 4px",
                                color: isOwn ? "#fff" : "var(--color-text-primary)",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                            }}
                            onContextMenu={handleContextMenu}
                        >
                            {/* WhatsApp tail (SVG triangle) */}
                            {isOwn ? (
                                <svg
                                    className="absolute bottom-0 right-0"
                                    style={{ transform: "translateX(100%) translateY(0)" }}
                                    width="8" height="13" viewBox="0 0 8 13"
                                >
                                    <path d="M0 0 Q0 11 8 13 L0 13 Z" fill={ownBg} />
                                </svg>
                            ) : (
                                <svg
                                    className="absolute bottom-0 left-0"
                                    style={{ transform: "translateX(-100%) translateY(0)" }}
                                    width="8" height="13" viewBox="0 0 8 13"
                                >
                                    <path d="M8 0 Q8 11 0 13 L8 13 Z" fill={otherBg} />
                                </svg>
                            )}

                            {/* Quote / reply preview */}
                            {message.replyToId && message.replyToContent && (
                                <div
                                    className="mx-2 mt-2 mb-1 px-2.5 py-1.5 rounded-lg text-xs border-l-[3px]"
                                    style={{
                                        backgroundColor: isOwn ? "rgba(0,0,0,0.15)" : "var(--color-surface-secondary)",
                                        borderColor: isOwn ? "rgba(255,255,255,0.6)" : "var(--color-primary-500)",
                                    }}
                                >
                  <span className="font-semibold block mb-0.5" style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)" }}>
                    Citation
                  </span>
                                    <span className="line-clamp-2" style={{ color: isOwn ? "rgba(255,255,255,0.8)" : "var(--color-text-secondary)" }}>
                    {message.replyToContent}
                  </span>
                                </div>
                            )}

                            {/* Attachments */}
                            {atts.map((att) => (
                                <AttachmentView
                                    key={att.id}
                                    attachment={att}
                                    isOwn={isOwn}
                                    onOpen={(a) => onOpenPreview?.(a)}
                                />
                            ))}

                            {/* Text content */}
                            {hasText && (
                                <div className={`px-3 ${atts.length > 0 ? "pt-1 pb-1" : "pt-2 pb-1.5"}`}>
                  <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </span>
                                    {message.isEdited && (
                                        <span className="text-xs ml-1 opacity-55">(modifié)</span>
                                    )}
                                </div>
                            )}

                            {/* Time + status row */}
                            <div
                                className={`flex items-center justify-end gap-1 pr-2 ${hasText ? "pb-1.5" : hasOnlyMedia ? "absolute bottom-2 right-2" : "pb-2"}`}
                                style={hasOnlyMedia ? {
                                    backgroundColor: "rgba(0,0,0,0.38)",
                                    borderRadius: 8,
                                    padding: "1px 5px",
                                } : {}}
                            >
                <span className="text-xs" style={{ opacity: hasOnlyMedia ? 1 : 0.65, color: hasOnlyMedia ? "#fff" : "inherit" }}>
                  {formatMsgTime(message.createdAt)}
                </span>
                                {isOwn && <StatusIcon status={message.status} />}
                            </div>
                        </div>

                        {/* Reply button for others */}
                        {!isOwn && hovered && (
                            <button
                                onClick={() => onReply(message)}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-100"
                                style={{ backgroundColor: "var(--color-surface-secondary)", opacity: 0.85 }}
                                title="Répondre"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Context menu */}
            {ctxMenu && (
                <ContextMenu
                    pos={ctxMenu}
                    isOwn={isOwn}
                    hasText={hasText}
                    onClose={() => setCtxMenu(null)}
                    onReply={() => onReply(message)}
                    onCopy={handleCopy}
                    onEdit={() => onEdit?.(message)}
                    onDelete={() => onDelete?.(message)}
                />
            )}
        </>
    );
}

export function DateSeparator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-3 px-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
            <span className="text-xs font-medium px-3 py-1 rounded-full shadow-sm" style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
        {label}
      </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
    );
}
