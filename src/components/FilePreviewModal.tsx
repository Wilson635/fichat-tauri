import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AttachmentDto } from "@/services/chatService";
import { docAccent, fileKind, fileKindLabel, formatFileSize, isImage, isVideo, isAudio, isPdf, isTextLike } from "@/utils/fileUtils";
import { getAttachmentObjectUrl, downloadAttachment, isInlineSrc } from "@/utils/attachmentUrl";
import { ensureExclusiveAudio } from "@/utils/audioPlayback";
import { FileVisualPreview } from "@/components/DocPreview";
import { Icon } from "@/components/Icon";

interface Props {
  attachment: AttachmentDto;
  senderName?: string | null;
  onClose: () => void;
}

interface Size { w: number; h: number }
interface Pos  { x: number; y: number }

export function FilePreviewModal({ attachment, senderName, onClose }: Props) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textSnippet, setTextSnippet] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const kind = fileKind(attachment.fileName, attachment.fileType);
  const accent = docAccent(attachment.fileName, attachment.fileType);
  const isImg = isImage(attachment.fileType, attachment.fileName);
  const isVid = isVideo(attachment.fileType, attachment.fileName);
  const isAud = isAudio(attachment.fileType, attachment.fileName);
  const isPDF = isPdf(attachment.fileType, attachment.fileName);
  const isText = isTextLike(attachment.fileName, attachment.fileType);

  const defaultW = isImg || isVid || isPDF ? 820 : 520;
  const defaultH = isImg || isVid || isPDF ? 600 : 420;

  const [size, setSize] = useState<Size>({
    w: Math.min(defaultW, window.innerWidth - 48),
    h: Math.min(defaultH, window.innerHeight - 48),
  });
  const [pos, setPos] = useState<Pos>({
    x: Math.round((window.innerWidth - Math.min(defaultW, window.innerWidth - 48)) / 2),
    y: Math.round((window.innerHeight - Math.min(defaultH, window.innerHeight - 48)) / 2),
  });

  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; sw: number; sh: number; px: number; py: number } | null>(null);

  useEffect(() => {
    ensureExclusiveAudio();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTextSnippet(null);

    getAttachmentObjectUrl(attachment)
      .then(async (url) => {
        if (cancelled) return;
        if (!isInlineSrc(attachment.filePath) && url.startsWith("blob:")) {
          objectUrlRef.current = url;
        }
        setSrcUrl(url);
        if (isText) {
          try {
            const text = await fetch(url).then((r) => r.text());
            if (!cancelled) setTextSnippet(text.slice(0, 4000));
          } catch {
            if (!cancelled) setTextSnippet(null);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.filePath, attachment.fileType, attachment.fileName, isText]);

  const onPointerDownMove = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: "move", sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h, px: pos.x, py: pos.y };
  }, [size, pos]);

  const onPointerDownResize = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: "resize", sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h, px: pos.x, py: pos.y };
  }, [size, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - d.sw, d.px + e.clientX - d.sx)),
        y: Math.max(0, Math.min(window.innerHeight - d.sh, d.py + e.clientY - d.sy)),
      });
    } else {
      setSize({
        w: Math.max(320, Math.min(window.innerWidth - d.px - 16, d.sw + e.clientX - d.sx)),
        h: Math.max(240, Math.min(window.innerHeight - d.py - 16, d.sh + e.clientY - d.sy)),
      });
    }
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = async () => {
    try {
      await downloadAttachment(attachment);
    } catch {
      if (!srcUrl) return;
      const a = document.createElement("a");
      a.href = srcUrl;
      a.download = attachment.fileName;
      a.click();
    }
  };

  const mediaReady = !loading && !error && !!srcUrl;
  const showNative = mediaReady && (isImg || isVid || isAud || isPDF);
  const showGeneric = mediaReady && !showNative;

  const modal = (
    <div
      className="fichat-preview-scrim"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="fichat-preview-win"
        style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="fichat-preview-head" onPointerDown={onPointerDownMove}>
          <span className="fichat-preview-chip" style={{ backgroundColor: accent.bg, color: accent.fg }}>
            {accent.label.slice(0, 4)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {attachment.fileName}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {[senderName, fileKindLabel(kind), formatFileSize(attachment.fileSize)].filter(Boolean).join(" · ")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!srcUrl && loading}
            className="icon-btn"
            style={{ color: "var(--color-primary-500)" }}
            title="Télécharger"
          >
            <Icon name="download" size={16} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            style={{ color: "var(--color-text-muted)" }}
            title="Fermer (Échap)"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="fichat-preview-body">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <Icon name="loader" size={28} className="animate-spin" style={{ color: "var(--color-primary-500)" }} />
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Chargement…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 px-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                <Icon name="alert" size={26} />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Fichier inaccessible</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{error}</p>
            </div>
          )}

          {showNative && isImg && (
            <img
              src={srcUrl!}
              alt={attachment.fileName}
              className="max-w-full max-h-full object-contain"
              style={{ userSelect: "none" }}
              draggable={false}
            />
          )}

          {showNative && isVid && (
            <video
              src={srcUrl!}
              controls
              autoPlay={false}
              className="max-w-full max-h-full"
              style={{ outline: "none" }}
            />
          )}

          {showNative && isAud && (
            <div className="flex flex-col items-center gap-5 p-8">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "var(--color-active)", color: "var(--color-primary-600)" }}
              >
                <Icon name="mic" size={32} />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{attachment.fileName}</p>
              <audio src={srcUrl!} controls className="w-full max-w-sm" />
            </div>
          )}

          {showNative && isPDF && (
            <iframe
              src={srcUrl!}
              title={attachment.fileName}
              className="w-full h-full border-0"
              style={{ backgroundColor: "#fff" }}
            />
          )}

          {showGeneric && (
            <div className="fichat-preview-generic">
              <div className="fichat-preview-generic-hero">
                <FileVisualPreview
                  fileName={attachment.fileName}
                  mime={attachment.fileType}
                  fileSize={attachment.fileSize}
                  thumbnail={attachment.thumbnail}
                  src={srcUrl}
                  textSnippet={textSnippet}
                  variant="overlay"
                />
              </div>
              <div>
                <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {attachment.fileName}
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {fileKindLabel(kind)}
                  {attachment.fileSize ? ` · ${formatFileSize(attachment.fileSize)}` : ""}
                </p>
              </div>
              <button type="button" className="fichat-preview-dl" onClick={handleDownload}>
                <Icon name="download" size={15} />
                Télécharger
              </button>
            </div>
          )}
        </div>

        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize"
          onPointerDown={onPointerDownResize}
          style={{ touchAction: "none" }}
        >
          <svg viewBox="0 0 10 10" className="w-4 h-4 absolute bottom-1 right-1" style={{ color: "var(--color-border)" }}>
            <path d="M 9 1 L 9 9 L 1 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M 9 5 L 5 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
