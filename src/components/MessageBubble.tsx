import { useState, useRef } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { useAuthStore } from "@/store/authStore";
import { formatFileSize, isImage, isVideo, isAudio, isPdf } from "@/utils/fileUtils";

export function formatDateSeparator(iso: string): string {
    const d = new Date(iso);
    if (isToday(d)) return "Aujourd'hui";
    if (isYesterday(d)) return "Hier";
    return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

function formatMsgTime(iso: string): string {
    return format(new Date(iso), "HH:mm");
}

function StatusIcon({ status }: { status: MessageDto["status"] }) {
    if (status === "sending") return (
        <svg className="w-3 h-3 opacity-60 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /></svg>
    );
    if (status === "sent") return (
        <svg className="w-3.5 h-3" viewBox="0 0 16 11" fill="currentColor" style={{ opacity: 0.7 }}>
            <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
        </svg>
    );
    if (status === "delivered") return (
        <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ opacity: 0.7 }}>
            <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
            <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
        </svg>
    );
    if (status === "read") return (
        <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ color: "var(--color-primary-300)" }}>
            <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
            <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
        </svg>
    );
    return null;
}

// ─── Icônes SVG inline par type (sans getFileIcon) ────────────────────────────
function DocIcon({ ext }: { ext: string }) {
    const e = ext.toLowerCase();
    if (["doc", "docx"].includes(e)) return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
    );
    if (["xls", "xlsx", "csv"].includes(e)) return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c0 .621.504 1.125 1.125 1.125h15c.621 0 1.125-.504 1.125-1.125m-18.375 0v7.5" />
        </svg>
    );
    if (["ppt", "pptx"].includes(e)) return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
    );
    if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
    );
    // default generic
    return (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
    );
}

// Couleurs neutres par extension (pas de getFileColor)
function getDocAccent(ext: string): { bg: string; fg: string } {
    const e = ext.toLowerCase();
    if (["doc", "docx"].includes(e)) return { bg: "rgba(59,130,246,0.12)", fg: "#3b82f6" };
    if (["xls", "xlsx", "csv"].includes(e)) return { bg: "rgba(34,197,94,0.12)", fg: "#22c55e" };
    if (["ppt", "pptx"].includes(e)) return { bg: "rgba(249,115,22,0.12)", fg: "#f97316" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return { bg: "rgba(168,85,247,0.12)", fg: "#a855f7" };
    if (["pdf"].includes(e)) return { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" };
    return { bg: "rgba(100,116,139,0.12)", fg: "#64748b" };
}

function getExtension(filename: string): string {
    return filename.split(".").pop() ?? "";
}

// ─── Audio player inline ──────────────────────────────────────────────────────
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

    const formatDur = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <div
            className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl"
            style={{
                backgroundColor: isOwn ? "rgba(255,255,255,0.12)" : "var(--color-surface-secondary)",
                minWidth: 220, maxWidth: 280,
            }}
        >
            <audio
                ref={audioRef}
                src={attachment.url}
                onTimeUpdate={() => {
                    const a = audioRef.current;
                    if (a && a.duration) setProgress(a.currentTime / a.duration);
                }}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                onEnded={() => { setPlaying(false); setProgress(0); }}
            />
            {/* Play/pause */}
            <button
                onClick={toggle}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
                style={{
                    backgroundColor: isOwn ? "rgba(255,255,255,0.2)" : "var(--color-primary-500)",
                    color: isOwn ? "#fff" : "#fff",
                }}
            >
                {playing ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {/* Waveform bar */}
                <div className="relative h-6 flex items-center">
                    {/* Fake waveform bars */}
                    <div className="flex items-center gap-px w-full h-full">
                        {Array.from({ length: 28 }).map((_, i) => {
                            // Pseudo-random heights seeded by filename
                            const seed = (attachment.fileName.charCodeAt(i % attachment.fileName.length) + i * 7) % 10;
                            const h = 25 + seed * 7;
                            const filled = i / 28 <= progress;
                            return (
                                <div
                                    key={i}
                                    className="flex-1 rounded-full transition-colors"
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
                </div>
                {/* Duration */}
                <span className="text-xs" style={{ opacity: 0.6, fontSize: 10 }}>
          {playing ? formatDur((audioRef.current?.currentTime ?? 0)) : formatDur(duration)}
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
            <button
                onClick={onOpen}
                className="relative block rounded-xl overflow-hidden mt-1 focus:outline-none"
                style={{ maxWidth: 280 }}
            >
                <img
                    src={attachment.thumbnail}
                    alt={attachment.fileName}
                    className="w-full object-cover"
                    style={{ maxHeight: 180, display: "block" }}
                    onError={() => setImgError(true)}
                />
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                        <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-white text-xs font-medium" style={{ backgroundColor: "rgba(0,0,0,0.6)", fontSize: 10 }}>
                    {formatFileSize(attachment.fileSize)}
                </div>
            </button>
        );
    }

    // Fallback chip
    return (
        <button
            onClick={onOpen}
            className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl focus:outline-none hover:opacity-90 transition-opacity"
            style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)", maxWidth: 280 }}
        >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.15)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#8b5cf6" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium truncate">{attachment.fileName}</p>
                <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </button>
    );
}

// ─── PDF preview ──────────────────────────────────────────────────────────────
function PdfPreview({ attachment, isOwn, onOpen }: { attachment: AttachmentDto; isOwn: boolean; onOpen: () => void }) {
    const [imgError, setImgError] = useState(false);
    const accent = getDocAccent("pdf");

    return (
        <button
            onClick={onOpen}
            className="flex flex-col rounded-xl overflow-hidden mt-1 focus:outline-none hover:opacity-90 transition-opacity text-left"
            style={{
                backgroundColor: isOwn ? "rgba(255,255,255,0.12)" : "var(--color-surface-secondary)",
                maxWidth: 280, minWidth: 200,
            }}
        >
            {/* Thumbnail strip */}
            {attachment.thumbnail && !imgError ? (
                <img
                    src={attachment.thumbnail}
                    alt="aperçu PDF"
                    className="w-full object-cover object-top"
                    style={{ maxHeight: 140, display: "block" }}
                    onError={() => setImgError(true)}
                />
            ) : (
                <div
                    className="w-full flex items-center justify-center"
                    style={{ height: 80, backgroundColor: isOwn ? "rgba(255,255,255,0.08)" : "var(--color-border)" }}
                >
                    <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
                        <rect width="48" height="48" rx="8" fill={accent.bg} />
                        <text x="50%" y="60%" textAnchor="middle" fill={accent.fg} fontSize="14" fontWeight="700" fontFamily="sans-serif">PDF</text>
                    </svg>
                </div>
            )}
            {/* Footer row */}
            <div className="flex items-center gap-2 px-3 py-2">
                <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: accent.bg, color: accent.fg }}
                >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "inherit" }}>{attachment.fileName}</p>
                    <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
                </div>
            </div>
        </button>
    );
}

// ─── Generic document chip ────────────────────────────────────────────────────
function DocChip({ attachment, isOwn, onOpen }: { attachment: AttachmentDto; isOwn: boolean; onOpen: () => void }) {
    const ext = getExtension(attachment.fileName);
    const accent = getDocAccent(ext);

    return (
        <button
            onClick={onOpen}
            className="flex items-center gap-3 mt-1 px-3 py-2.5 rounded-xl focus:outline-none hover:opacity-90 transition-opacity"
            style={{
                backgroundColor: isOwn ? "rgba(255,255,255,0.12)" : "var(--color-surface-secondary)",
                maxWidth: 300,
            }}
        >
            <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: accent.bg, color: accent.fg }}
            >
                <DocIcon ext={ext} />
            </div>
            <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold truncate">{attachment.fileName}</p>
                <p className="text-xs opacity-60">{formatFileSize(attachment.fileSize)}</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        </button>
    );
}

// ─── Single attachment dispatcher ─────────────────────────────────────────────
function AttachmentView({
                            attachment, isOwn, onOpen,
                        }: {
    attachment: AttachmentDto;
    isOwn: boolean;
    onOpen: (att: AttachmentDto) => void;
}) {
    const [imgError, setImgError] = useState(false);

    if (isImage(attachment.fileType) && !imgError) {
        return (
            <button
                onClick={() => onOpen(attachment)}
                className="block rounded-xl overflow-hidden focus:outline-none mt-1"
                style={{ maxWidth: 280 }}
                title="Voir l'image"
            >
                {attachment.thumbnail ? (
                    <img
                        src={attachment.thumbnail}
                        alt={attachment.fileName}
                        className="w-full object-cover"
                        style={{ maxHeight: 220, display: "block" }}
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="flex items-center justify-center w-48 h-32 rounded-xl" style={{ backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}
            </button>
        );
    }

    if (isVideo(attachment.fileType)) {
        return <VideoPreview attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }

    if (isAudio(attachment.fileType)) {
        return <AudioPlayer attachment={attachment} isOwn={isOwn} />;
    }

    if (isPdf(attachment.fileType)) {
        return <PdfPreview attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }

    return <DocChip attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
    message: MessageDto;
    showSenderName: boolean;
    onReply: (msg: MessageDto) => void;
    onOpenPreview?: (att: AttachmentDto) => void;
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
export function MessageBubble({ message, showSenderName, onReply, onOpenPreview }: Props) {
    const { user } = useAuthStore();
    const isOwn = message.senderId === user?.id;
    const [hovered, setHovered] = useState(false);

    if (message.messageType === "system") {
        return (
            <div className="flex justify-center my-2 px-4">
        <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
          {message.content}
        </span>
            </div>
        );
    }

    if (message.isDeleted) {
        return (
            <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
                <div className="px-3 py-2 rounded-lg text-sm italic max-w-xs" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
                    🚫 Message supprimé
                </div>
            </div>
        );
    }

    const initials = (message.senderName ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const hue = (message.senderName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

    const hasText = !!message.content?.trim();
    const atts = message.attachments ?? [];

    const bubbleStyle: React.CSSProperties = {
        backgroundColor: isOwn ? "var(--color-primary-500)" : "var(--color-surface)",
        borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        color: isOwn ? "#fff" : "var(--color-text-primary)",
    };

    return (
        <div
            className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1 group px-2`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {!isOwn && (
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mr-2 mt-1 self-end"
                    style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
                >
                    {initials}
                </div>
            )}

            <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                {showSenderName && !isOwn && (
                    <span className="text-xs font-semibold mb-1 ml-1" style={{ color: `hsl(${hue}, 55%, 45%)` }}>
            {message.senderName}
          </span>
                )}

                <div className="relative flex items-end gap-1">
                    {/* Reply button (own messages, left side) */}
                    {isOwn && hovered && (
                        <button
                            onClick={() => onReply(message)}
                            className="w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "var(--color-surface-secondary)" }}
                            title="Répondre"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                        </button>
                    )}

                    {/* Bubble */}
                    <div className="px-3 py-2 rounded-2xl shadow-sm" style={bubbleStyle}>
                        {/* Quote */}
                        {message.replyToId && message.replyToContent && (
                            <div
                                className="mb-2 px-2 py-1.5 rounded-lg text-xs border-l-2 opacity-80"
                                style={{
                                    backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "var(--color-surface-secondary)",
                                    borderColor: isOwn ? "rgba(255,255,255,0.6)" : "var(--color-primary-500)",
                                }}
                            >
                <span className="font-semibold block mb-0.5" style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--color-primary-500)" }}>
                  Citation
                </span>
                                <span className="line-clamp-2">{message.replyToContent}</span>
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
                            <span className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${atts.length > 0 ? "mt-1 block" : ""}`}>
                {message.content}
              </span>
                        )}
                        {message.isEdited && (
                            <span className="text-xs ml-1 opacity-60">(modifié)</span>
                        )}

                        {/* Time + status */}
                        <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <span className="text-xs opacity-60">{formatMsgTime(message.createdAt)}</span>
                            {isOwn && <span className="opacity-80"><StatusIcon status={message.status} /></span>}
                        </div>
                    </div>

                    {/* Reply button (others, right side) */}
                    {!isOwn && hovered && (
                        <button
                            onClick={() => onReply(message)}
                            className="w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "var(--color-surface-secondary)" }}
                            title="Répondre"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function DateSeparator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-4 px-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
            <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
        {label}
      </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
    );
}