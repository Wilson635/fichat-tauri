import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import type { MessageDto, AttachmentDto } from "@/services/chatService";
import { useAuthStore } from "@/store/authStore";
import { formatFileSize, isImage, isVideo, isAudio, fileKind } from "@/utils/fileUtils";
import { useAttachmentUrl, downloadAttachment, previewSrc } from "@/utils/attachmentUrl";
import { Icon } from "@/components/Icon";
import { AttachmentVisualPreview, DocMetaRow } from "@/components/DocPreview";
import {
    audioPlaybackKey,
    isPlayableAudioAttachment,
    notifyAudioEnded,
    notifyAudioPaused,
    registerAudioPlayer,
    requestAudioPlay,
} from "@/utils/audioPlayback";

export function formatDateSeparator(iso: string): string {
    const d = new Date(iso);
    if (isToday(d)) return "Aujourd'hui";
    if (isYesterday(d)) return "Hier";
    return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

function formatMsgTime(iso: string): string {
    return format(new Date(iso), "HH:mm");
}

function finiteSeconds(s: number | null | undefined): number | null {
    if (s == null || !Number.isFinite(s) || s < 0 || s > 24 * 3600) return null;
    return s;
}

function formatClock(s: number | null): string {
    const n = finiteSeconds(s);
    if (n == null) return "0:00";
    const total = Math.floor(n);
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/** Duration encoded at send time: message-vocal-{secs}s-{timestamp}.webm */
function parseVoiceDuration(fileName: string): number | null {
    const m = fileName.match(/message-vocal-(\d+)s[-_.]/i);
    if (!m) return null;
    return finiteSeconds(Number(m[1]));
}

function waveHeights(seed: string, count = 32): number[] {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        out.push(22 + (Math.abs(h) % 78));
    }
    return out;
}

function StatusIcon({ status }: { status: MessageDto["status"] }) {
    if (status === "sending") {
        return (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ opacity: 0.45 }}>
                <circle cx="12" cy="12" r="9" />
            </svg>
        );
    }
    if (status === "sent") {
        return (
            <svg className="w-3.5 h-3" viewBox="0 0 16 11" fill="currentColor" style={{ opacity: 0.55 }}>
                <path d="M11.071.653a.75.75 0 0 1 .053 1.059l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 0 1 1.058-.053Z" />
            </svg>
        );
    }
    if (status === "delivered") {
        return (
            <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ opacity: 0.55 }}>
                <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
                <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
            </svg>
        );
    }
    if (status === "read") {
        return (
            <svg className="w-4 h-3" viewBox="0 0 22 11" fill="currentColor" style={{ color: "#3B82F6" }}>
                <path d="M1.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L1.28 5.842Z" />
                <path d="M8.28 5.842a.75.75 0 1 1 1.114-1.004l1.984 2.2 5.635-6.332a.75.75 0 1 1 1.111 1.006l-6.25 7a.75.75 0 0 1-1.118-.006L8.28 5.842Z" />
            </svg>
        );
    }
    return null;
}

function FileGlyph({ fileName, mime }: { fileName: string; mime?: string | null }) {
    const kind = fileKind(fileName, mime);
    const label = kind === "pdf" ? "PDF" : (fileName.split(".").pop() ?? "DOC").toUpperCase().slice(0, 4);
    const bg =
        kind === "word" ? "#2B579A" :
        kind === "spreadsheet" ? "#217346" :
        kind === "slides" ? "#C43E1C" :
        kind === "archive" ? "#5B6570" :
        kind === "pdf" ? "#E11D48" :
        kind === "video" ? "#6D28D9" :
        kind === "audio" ? "#0F766E" :
        "#475569";
    return (
        <div className="relative shrink-0" style={{ width: 34, height: 42 }} aria-hidden>
            <svg viewBox="0 0 34 42" className="absolute inset-0 w-full h-full">
                <path d="M3.5 2.5h18.2L31.5 12.3V38a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 38V6A3.5 3.5 0 0 1 7 2.5z" fill={bg} />
                <path d="M21.7 2.5v7.2c0 1.4 1.1 2.5 2.5 2.5h7.3" fill="rgba(255,255,255,0.28)" />
            </svg>
            <span
                className="absolute left-0 right-0 text-center font-bold tracking-wide"
                style={{ bottom: 7, fontSize: 8, color: "#fff", letterSpacing: "0.06em" }}
            >
                {label}
            </span>
        </div>
    );
}

function DocCard({
    attachment,
    isOwn,
    onOpen,
}: {
    attachment: AttachmentDto;
    isOwn: boolean;
    onOpen: () => void;
}) {
    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        downloadAttachment(attachment).catch(() => {});
    };

    return (
        <div className="p-1.5" style={{ minWidth: 228, maxWidth: 280 }}>
            <button
                type="button"
                onClick={onOpen}
                className="w-full text-left rounded-xl overflow-hidden"
                style={{ backgroundColor: isOwn ? "rgba(15, 23, 42, 0.06)" : "var(--color-surface-secondary)" }}
            >
                <div className="doc-bubble-preview">
                    <AttachmentVisualPreview attachment={attachment} variant="bubble" />
                </div>
                <div className="flex items-center gap-1 px-2 py-2">
                    <div className="flex-1 min-w-0">
                        <DocMetaRow fileName={attachment.fileName} mime={attachment.fileType} fileSize={attachment.fileSize} />
                    </div>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={handleSave}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSave(e as unknown as React.MouseEvent);
                            }
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ color: "var(--color-text-muted)" }}
                        title="Enregistrer"
                    >
                        <Icon name="download" size={15} />
                    </span>
                </div>
            </button>
        </div>
    );
}

function AudioPlayer({
    attachment,
    isOwn,
    voice = false,
    playbackKey,
}: {
    attachment: AttachmentDto;
    isOwn: boolean;
    voice?: boolean;
    playbackKey: string;
}) {
    const encoded = parseVoiceDuration(attachment.fileName);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState<number | null>(encoded);
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveRef = useRef<HTMLDivElement>(null);
    const seekingRef = useRef(false);
    const wantPlayRef = useRef(false);
    const startedRef = useRef(false);
    const { url, loading } = useAttachmentUrl(attachment);
    const bars = useMemo(() => waveHeights(attachment.fileName, voice ? 36 : 28), [attachment.fileName, voice]);

    const knownTotal = () => finiteSeconds(audioRef.current?.duration) ?? duration;

    const applyKnown = useCallback((raw: number | null | undefined) => {
        const next = finiteSeconds(raw);
        if (next == null) return;
        setDuration((prev) => {
            if (encoded != null && next + 0.6 < encoded) return prev ?? encoded;
            if (prev == null || Math.abs(prev - next) > 0.4) return next;
            return prev;
        });
    }, [encoded]);

    const startPlayback = useCallback(() => {
        wantPlayRef.current = true;
        startedRef.current = true;
        const a = audioRef.current;
        if (!a) return;
        a.play().catch(() => {});
        setPlaying(true);
    }, []);

    const stopPlayback = useCallback(() => {
        wantPlayRef.current = false;
        startedRef.current = false;
        const a = audioRef.current;
        if (a && !a.paused) a.pause();
        setPlaying(false);
    }, []);

    useEffect(() => {
        return registerAudioPlayer(playbackKey, {
            play: startPlayback,
            pause: stopPlayback,
        });
    }, [playbackKey, startPlayback, stopPlayback]);

    useEffect(() => {
        if (url && wantPlayRef.current && audioRef.current) {
            audioRef.current.play().catch(() => {});
            setPlaying(true);
        }
    }, [url]);

    const toggle = () => {
        if (playing) {
            stopPlayback();
            notifyAudioPaused(playbackKey);
            return;
        }
        if (!url) return;
        requestAudioPlay(playbackKey);
    };

    const seekAt = (clientX: number) => {
        const el = waveRef.current;
        const a = audioRef.current;
        const total = knownTotal();
        if (!el || !a || total == null || total <= 0) return;
        const rect = el.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        a.currentTime = ratio * total;
        setProgress(ratio);
        setElapsed(ratio * total);
    };

    const displayTime = playing || elapsed > 0 ? elapsed : (duration ?? elapsed);
    const filled = progress <= 0 ? -1 : Math.round(progress * bars.length);
    const sizeLabel = formatFileSize(attachment.fileSize);

    return (
        <div
            className={`fichat-audio-card ${voice ? "is-voice" : "is-file"}${isOwn ? " is-own" : ""}${playing ? " is-playing" : ""}`}
        >
            {url && (
                <audio
                    ref={audioRef}
                    src={url}
                    preload="metadata"
                    data-playback-key={playbackKey}
                    onLoadedMetadata={() => {
                        const a = audioRef.current;
                        if (!a) return;
                        const meta = finiteSeconds(a.duration);
                        if (meta != null) {
                            applyKnown(meta);
                            return;
                        }
                        if (encoded != null) {
                            applyKnown(encoded);
                            return;
                        }
                        // Chromium often reports Infinity for MediaRecorder WebM blobs.
                        const onSeeked = () => {
                            a.removeEventListener("seeked", onSeeked);
                            applyKnown(a.duration);
                            try { a.currentTime = 0; } catch { /* ignore */ }
                        };
                        a.addEventListener("seeked", onSeeked);
                        try {
                            a.currentTime = 1e10;
                        } catch {
                            a.removeEventListener("seeked", onSeeked);
                        }
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => {
                        if (!audioRef.current?.ended) setPlaying(false);
                    }}
                    onTimeUpdate={() => {
                        const a = audioRef.current;
                        if (!a) return;
                        const total = finiteSeconds(a.duration) ?? duration;
                        setElapsed(Number.isFinite(a.currentTime) ? a.currentTime : 0);
                        if (total && total > 0) setProgress(Math.min(1, a.currentTime / total));
                        applyKnown(a.duration);
                    }}
                    onEnded={() => {
                        const a = audioRef.current;
                        applyKnown(a?.currentTime);
                        const chain = startedRef.current;
                        wantPlayRef.current = false;
                        startedRef.current = false;
                        setPlaying(false);
                        setProgress(0);
                        setElapsed(0);
                        if (chain) notifyAudioEnded(playbackKey);
                    }}
                />
            )}
            <div className="fichat-audio-play-wrap">
                <button
                    type="button"
                    onClick={toggle}
                    disabled={!url || loading}
                    className={`fichat-audio-play${playing ? " is-on" : ""}`}
                    title={playing ? "Pause" : "Lecture"}
                    aria-label={playing ? "Pause" : voice ? "Lire le message vocal" : "Lire le fichier audio"}
                >
                    {loading ? (
                        <Icon name="loader" size={16} className="animate-spin" />
                    ) : playing ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>
                {voice && (
                    <span className="fichat-audio-chip" aria-hidden>
                        <Icon name="mic" size={13} strokeWidth={2.5} />
                    </span>
                )}
            </div>
            <div className="fichat-audio-body">
                {!voice && (
                    <p className="fichat-audio-name" title={attachment.fileName}>
                        {attachment.fileName}
                    </p>
                )}
                <div className={voice ? "fichat-audio-voice-row" : "contents"}>
                    <div
                    ref={waveRef}
                    className={`fichat-audio-wave${playing ? " is-playing" : ""}`}
                    role="slider"
                    aria-label="Position de lecture"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    tabIndex={0}
                    onPointerDown={(e) => {
                        seekingRef.current = true;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        seekAt(e.clientX);
                    }}
                    onPointerMove={(e) => {
                        if (seekingRef.current) seekAt(e.clientX);
                    }}
                    onPointerUp={() => {
                        seekingRef.current = false;
                    }}
                    onPointerCancel={() => {
                        seekingRef.current = false;
                    }}
                    onKeyDown={(e) => {
                        const a = audioRef.current;
                        const total = knownTotal();
                        if (!a || total == null || total <= 0) return;
                        const step = total * 0.05;
                        if (e.key === "ArrowRight") {
                            e.preventDefault();
                            a.currentTime = Math.min(total, a.currentTime + step);
                        } else if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            a.currentTime = Math.max(0, a.currentTime - step);
                        }
                    }}
                >
                    {bars.map((h, i) => (
                        <span
                            key={i}
                            className={i <= filled ? "is-on" : undefined}
                            style={{ height: `${h}%`, animationDelay: `${(i % 8) * 45}ms` }}
                        />
                    ))}
                </div>
                {voice && (
                    <span className="fichat-audio-time tabular-nums">{formatClock(displayTime)}</span>
                )}
                </div>
                {!voice && (
                <div className="fichat-audio-meta">
                    <span className="tabular-nums">{formatClock(displayTime)}</span>
                    <span className="dot" aria-hidden />
                    <span>Audio</span>
                    {sizeLabel ? (
                        <>
                            <span className="dot" aria-hidden />
                            <span className="tabular-nums">{sizeLabel}</span>
                        </>
                    ) : null}
                </div>
                )}
            </div>
        </div>
    );
}

function VideoPreview({
    attachment,
    isOwn,
    onOpen,
}: {
    attachment: AttachmentDto;
    isOwn: boolean;
    onOpen: () => void;
}) {
    const [imgError, setImgError] = useState(false);

    if (attachment.thumbnail && !imgError) {
        return (
            <button
                type="button"
                onClick={onOpen}
                className="relative block w-full overflow-hidden focus:outline-none"
                style={{ maxHeight: 210 }}
            >
                <img
                    src={attachment.thumbnail}
                    alt={attachment.fileName}
                    className="w-full object-cover block"
                    style={{ maxHeight: 210 }}
                    onError={() => setImgError(true)}
                />
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(15,23,42,0.28)" }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(15,23,42,0.72)" }}>
                        <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            </button>
        );
    }

    return (
        <div className="px-2.5 pt-2.5 pb-1" style={{ minWidth: 220, maxWidth: 280 }}>
            <button
                type="button"
                onClick={onOpen}
                className="w-full flex items-center gap-3 text-left rounded-xl px-2 py-2"
                style={{ backgroundColor: isOwn ? "rgba(15, 23, 42, 0.06)" : "var(--color-surface-secondary)" }}
            >
                <FileGlyph fileName={attachment.fileName} mime={attachment.fileType} />
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{attachment.fileName}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        Vidéo · {formatFileSize(attachment.fileSize)}
                    </p>
                </div>
            </button>
        </div>
    );
}

function ImageAttachment({
    attachment,
    isOwn,
    onOpen,
}: {
    attachment: AttachmentDto;
    isOwn: boolean;
    onOpen: () => void;
}) {
    const [imgError, setImgError] = useState(false);
    const preview = previewSrc(attachment);
    const { url, loading } = useAttachmentUrl(preview ? null : attachment, true);
    const src = preview || url;

    if (imgError) {
        return (
            <div
                className="flex items-center justify-center w-48 h-28"
                style={{ backgroundColor: isOwn ? "rgba(15,23,42,0.06)" : "var(--color-surface-secondary)" }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 opacity-35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
        );
    }

    return (
        <button type="button" onClick={onOpen} className="block w-full overflow-hidden focus:outline-none" style={{ maxWidth: 280 }}>
            {src ? (
                <img src={src} alt={attachment.fileName} className="w-full object-cover block" style={{ maxHeight: 280 }} onError={() => setImgError(true)} />
            ) : (
                <div className="w-48 h-28 flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                    {loading ? (
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 opacity-35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    )}
                </div>
            )}
        </button>
    );
}

function isVoiceAttachment(messageType: string | undefined, att: AttachmentDto): boolean {
    if (messageType === "voice") return true;
    return isAudio(att.fileType, att.fileName) && /^message-vocal/i.test(att.fileName);
}

function AttachmentView({
    attachment,
    isOwn,
    onOpen,
    messageType,
    messageId,
}: {
    attachment: AttachmentDto;
    isOwn: boolean;
    onOpen: (a: AttachmentDto) => void;
    messageType?: string;
    messageId: number;
}) {
    if (isPlayableAudioAttachment(messageType, attachment)) {
        return (
            <AudioPlayer
                attachment={attachment}
                isOwn={isOwn}
                voice={isVoiceAttachment(messageType, attachment)}
                playbackKey={audioPlaybackKey(messageId, attachment.id)}
            />
        );
    }
    if (isImage(attachment.fileType, attachment.fileName)) {
        return <ImageAttachment attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }
    if (isVideo(attachment.fileType, attachment.fileName)) {
        return <VideoPreview attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
    }
    return <DocCard attachment={attachment} isOwn={isOwn} onOpen={() => onOpen(attachment)} />;
}

interface CtxMenu {
    x: number;
    y: number;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface CtxMenuProps {
    pos: CtxMenu;
    isOwn: boolean;
    hasText: boolean;
    hasAttachment: boolean;
    onClose: () => void;
    onReply: () => void;
    onCopy: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function ContextMenu({ pos, isOwn, hasText, hasAttachment, onClose, onReply, onCopy, onEdit, onDelete }: CtxMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", esc);
        };
    }, [onClose]);

    const menuW = 220;
    const menuH = 340;
    const emojiBarH = 56;
    const left = Math.min(pos.x, window.innerWidth - menuW - 8);
    const top = Math.min(pos.y, window.innerHeight - menuH - emojiBarH - 8);

    const items = [
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
            ),
            label: "Répondre",
            action: () => {
                onReply();
                onClose();
            },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            label: "Copier",
            action: () => {
                onCopy();
                onClose();
            },
            show: hasText,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
            ),
            label: "Épingler",
            action: () => {
                onClose();
            },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
            ),
            label: "Marquer comme important",
            action: () => {
                onClose();
            },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            label: "Sélectionner",
            action: () => {
                onClose();
            },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            ),
            label: "Enregistrer sous",
            action: () => {
                onClose();
            },
            show: hasAttachment,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
            ),
            label: "Partager",
            action: () => {
                onClose();
            },
            show: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            ),
            label: "Modifier",
            action: () => {
                onEdit();
                onClose();
            },
            show: isOwn && hasText,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            ),
            label: "Supprimer",
            action: () => {
                onDelete();
                onClose();
            },
            show: isOwn,
            danger: true,
        },
    ];

    return (
        <div
            ref={ref}
            className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden"
            style={{
                left,
                top,
                minWidth: menuW,
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                {EMOJI_REACTIONS.map((emoji) => (
                    <button key={emoji} onClick={onClose} className="text-xl leading-none hover:scale-125 transition-transform" title={emoji}>
                        {emoji}
                    </button>
                ))}
                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-lg hover:scale-110 transition-transform"
                    style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}
                    title="Autre réaction"
                >
                    +
                </button>
            </div>

            <div className="py-1">
                {items
                    .filter((i) => i.show)
                    .map((item, idx) => (
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
        </div>
    );
}

interface Props {
    message: MessageDto;
    showSenderName: boolean;
    onReply: (msg: MessageDto) => void;
    onEdit?: (msg: MessageDto) => void;
    onDelete?: (msg: MessageDto) => void;
    onOpenPreview?: (att: AttachmentDto) => void;
}

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

    if (message.messageType === "system") {
        return (
            <div className="flex justify-center my-2 px-4">
                <span
                    className="text-[11px] px-2.5 py-1 rounded-md"
                    style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}
                >
                    {message.content}
                </span>
            </div>
        );
    }

    if (message.isDeleted) {
        return (
            <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1 px-3`}>
                <div
                    className="px-3 py-2 rounded-2xl text-[13px] italic max-w-xs flex items-center gap-2"
                    style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                    }}
                >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />
                    </svg>
                    Message supprimé
                </div>
            </div>
        );
    }

    const initials = (message.senderName ?? "?")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    const hue = (message.senderName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

    const hasText = !!message.content?.trim();
    const atts = message.attachments ?? [];
    const firstAtt = atts[0];
    const hasOnlyMedia =
        !!firstAtt &&
        !hasText &&
        (isImage(firstAtt.fileType, firstAtt.fileName) || (isVideo(firstAtt.fileType, firstAtt.fileName) && !!firstAtt.thumbnail));

    const ownBg = "var(--color-chat-outgoing)";
    const otherBg = "var(--color-chat-incoming)";

    return (
        <>
            <div
                className={`flex ${isOwn ? "justify-end" : "justify-start"} px-3`}
                style={{ marginBottom: showSenderName || isOwn ? 6 : 2 }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {!isOwn && (
                    <div className="flex flex-col justify-end mr-2 mb-0.5 shrink-0" style={{ width: 28 }}>
                        {showSenderName ? (
                            <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                                style={{ backgroundColor: `hsl(${hue}, 48%, 46%)` }}
                            >
                                {initials}
                            </div>
                        ) : (
                            <div className="w-7 h-7" />
                        )}
                    </div>
                )}

                <div className={`flex flex-col max-w-[68%] ${isOwn ? "items-end" : "items-start"}`}>
                    {showSenderName && !isOwn && (
                        <span className="text-[11px] font-medium mb-1 ml-1" style={{ color: `hsl(${hue}, 42%, 42%)` }}>
                            {message.senderName}
                        </span>
                    )}

                    <div className="relative flex items-end gap-1.5">
                        {isOwn && hovered && (
                            <button
                                type="button"
                                onClick={() => onReply(message)}
                                className="w-7 h-7 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                                title="Répondre"
                            >
                                <Icon name="reply" size={15} />
                            </button>
                        )}

                        <div
                            className="relative overflow-hidden msg-bubble"
                            style={{
                                backgroundColor: isOwn ? ownBg : otherBg,
                                borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                                color: "var(--color-text-primary)",
                                border: isOwn ? "none" : "1px solid var(--color-border)",
                            }}
                            onContextMenu={handleContextMenu}
                        >
                            {message.replyToId && message.replyToContent && (
                                <div
                                    className="mx-2.5 mt-2 mb-1 px-2.5 py-1.5 rounded-lg text-[12px] border-l-[3px]"
                                    style={{
                                        backgroundColor: isOwn ? "rgba(15,23,42,0.06)" : "var(--color-surface-secondary)",
                                        borderColor: "var(--color-primary-500)",
                                    }}
                                >
                                    <span className="font-semibold block mb-0.5" style={{ color: "var(--color-primary-600)" }}>
                                        Réponse
                                    </span>
                                    <span className="line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                                        {message.replyToContent}
                                    </span>
                                </div>
                            )}

                            {atts.map((att) => (
                                <AttachmentView
                                    key={att.id}
                                    attachment={att}
                                    isOwn={isOwn}
                                    messageId={message.id}
                                    messageType={message.messageType}
                                    onOpen={(a) => onOpenPreview?.(a)}
                                />
                            ))}

                            {hasText && (
                                <div
                                    className="msg-copy"
                                    style={{ padding: atts.length > 0 ? "6px 12px 8px" : "10px 12px 8px" }}
                                >
                                    <span className="whitespace-pre-wrap break-words">{message.content}</span>
                                    {message.isEdited && <span className="text-[11px] ml-1 opacity-50">(modifié)</span>}
                                    <span className="msg-meta">
                                        <span className="text-[10px] tabular-nums leading-none" style={{ color: "var(--color-text-muted)", opacity: 0.72 }}>
                                            {formatMsgTime(message.createdAt)}
                                        </span>
                                        {isOwn && <StatusIcon status={message.status} />}
                                    </span>
                                </div>
                            )}

                            {!hasText && (
                                <div
                                    className={`flex items-center justify-end gap-1 ${
                                        hasOnlyMedia ? "absolute bottom-1.5 right-1.5" : "px-2.5 pb-1.5 pt-0.5"
                                    }`}
                                    style={
                                        hasOnlyMedia
                                            ? {
                                                  backgroundColor: "rgba(15,23,42,0.45)",
                                                  borderRadius: 6,
                                                  padding: "1px 6px",
                                              }
                                            : {}
                                    }
                                >
                                    <span
                                        className="text-[10px] tabular-nums leading-none"
                                        style={{
                                            opacity: hasOnlyMedia ? 1 : 0.72,
                                            color: hasOnlyMedia ? "#fff" : "var(--color-text-muted)",
                                        }}
                                    >
                                        {formatMsgTime(message.createdAt)}
                                    </span>
                                    {isOwn && <StatusIcon status={message.status} />}
                                </div>
                            )}
                        </div>

                        {!isOwn && hovered && (
                            <button
                                type="button"
                                onClick={() => onReply(message)}
                                className="w-7 h-7 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                                title="Répondre"
                            >
                                <Icon name="reply" size={15} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {ctxMenu && (
                <ContextMenu
                    pos={ctxMenu}
                    isOwn={isOwn}
                    hasText={hasText}
                    hasAttachment={atts.length > 0}
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
        <div className="flex items-center justify-center my-4 px-4">
            <span
                className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                style={{
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                }}
            >
                {label}
            </span>
        </div>
    );
}
