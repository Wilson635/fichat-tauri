import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AttachmentDto } from "@/services/chatService";
import { chatService, isTauri } from "@/services/chatService";
import { formatFileSize, isImage, isVideo, isAudio, isPdf } from "@/utils/fileUtils";

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

  // ── Resizable / draggable modal ─────────────────────────────────────────────
  const isImg = isImage(attachment.fileType);
  const isVid = isVideo(attachment.fileType);
  const isAud = isAudio(attachment.fileType);
  const isPDF = isPdf(attachment.fileType);

  const defaultW = isImg || isVid || isPDF ? 820 : 480;
  const defaultH = isImg || isVid || isPDF ? 600 : 320;

  const [size, setSize] = useState<Size>({ w: Math.min(defaultW, window.innerWidth - 48), h: Math.min(defaultH, window.innerHeight - 48) });
  const [pos, setPos] = useState<Pos>({
    x: Math.round((window.innerWidth - size.w) / 2),
    y: Math.round((window.innerHeight - size.h) / 2),
  });

  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; sw: number; sh: number; px: number; py: number } | null>(null);

  // ── Load file ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const fp = attachment.filePath;

    // If already a data URL, use directly
    if (fp.startsWith("data:")) {
      setSrcUrl(fp);
      setLoading(false);
      return;
    }

    // Tauri: load from disk via base64
    if (isTauri()) {
      chatService.getFileAsBase64(fp)
        .then((b64) => {
          const mime = attachment.fileType || "application/octet-stream";
          setSrcUrl(`data:${mime};base64,${b64}`);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
      return;
    }

    // Web + no data URL (shouldn't happen in normal flow)
    setSrcUrl(fp);
    setLoading(false);
  }, [attachment.filePath, attachment.fileType]);

  // ── Pointer events for drag/resize ──────────────────────────────────────────
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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Download ──────────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!srcUrl) return;
    const a = document.createElement("a");
    a.href = srcUrl;
    a.download = attachment.fileName;
    a.click();
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          left: pos.x, top: pos.y,
          width: size.w, height: size.h,
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          minWidth: 320, minHeight: 240,
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* ── Title bar (drag to move) ───────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0 border-b select-none"
          style={{ backgroundColor: "var(--color-header-bg)", borderColor: "var(--color-border)", cursor: "move" }}
          onPointerDown={onPointerDownMove}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {attachment.fileName}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {[senderName, formatFileSize(attachment.fileSize)].filter(Boolean).join(" · ")}
            </p>
          </div>

          <button
            onClick={handleDownload}
            disabled={!srcUrl}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors disabled:opacity-40"
            style={{ color: "var(--color-primary-500)" }}
            title="Télécharger"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            title="Fermer (Échap)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Content ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative flex items-center justify-center" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24" style={{ color: "var(--color-primary-500)" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Chargement…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 px-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Fichier inaccessible</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{error}</p>
            </div>
          )}

          {!loading && !error && srcUrl && (
            <>
              {isImg && (
                <img
                  src={srcUrl}
                  alt={attachment.fileName}
                  className="max-w-full max-h-full object-contain"
                  style={{ userSelect: "none" }}
                  draggable={false}
                />
              )}

              {isVid && (
                <video
                  src={srcUrl}
                  controls
                  autoPlay={false}
                  className="max-w-full max-h-full"
                  style={{ outline: "none" }}
                />
              )}

              {isAud && (
                <div className="flex flex-col items-center gap-6 p-8">
                  <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(236,72,153,0.12)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "#ec4899" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{attachment.fileName}</p>
                  <audio src={srcUrl} controls className="w-full max-w-sm" />
                </div>
              )}

              {isPDF && (
                <iframe
                  src={srcUrl}
                  title={attachment.fileName}
                  className="w-full h-full border-0"
                  style={{ backgroundColor: "#fff" }}
                />
              )}

              {!isImg && !isVid && !isAud && !isPDF && (
                <div className="flex flex-col items-center gap-4 p-8 text-center">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl"
                    style={{ backgroundColor: "var(--color-primary-500)" }}
                  >
                    {attachment.fileName.split(".").pop()?.toUpperCase()?.slice(0, 4) ?? "?"}
                  </div>
                  <div>
                    <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {attachment.fileName}
                    </p>
                    <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--color-primary-500)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Télécharger
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Resize handle (bottom-right corner) ────────────────────────────── */}
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
