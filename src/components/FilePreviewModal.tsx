import { useEffect, useRef, useState } from "react";
import type { AttachmentDto } from "@/services/chatService";
import { docAccent, fileKind, fileKindLabel, formatFileSize, isImage, isVideo, isAudio, isPdf, isTextLike } from "@/utils/fileUtils";
import { getAttachmentObjectUrl, downloadAttachment, isInlineSrc } from "@/utils/attachmentUrl";
import { ensureExclusiveAudio } from "@/utils/audioPlayback";
import { FileVisualPreview } from "@/components/DocPreview";
import { useResizable } from "@/hooks/useResizable";
import { Icon } from "@/components/Icon";

interface Props {
  attachment: AttachmentDto;
  senderName?: string | null;
  onClose: () => void;
}

export function FilePreviewPanel({ attachment, senderName, onClose }: Props) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textSnippet, setTextSnippet] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const { size: panelWidth, dragHandleProps } = useResizable(460, 340, 720, "left");

  const kind = fileKind(attachment.fileName, attachment.fileType);
  const accent = docAccent(attachment.fileName, attachment.fileType);
  const isImg = isImage(attachment.fileType, attachment.fileName);
  const isVid = isVideo(attachment.fileType, attachment.fileName);
  const isAud = isAudio(attachment.fileType, attachment.fileName);
  const isPDF = isPdf(attachment.fileType, attachment.fileName);
  const isText = isTextLike(attachment.fileName, attachment.fileType);

  useEffect(() => {
    ensureExclusiveAudio();
  }, []);

  useEffect(() => {
    setDownloaded(false);
  }, [attachment.id, attachment.fileName]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = async () => {
    setDlBusy(true);
    try {
      await downloadAttachment(attachment);
      setDownloaded(true);
    } catch {
      if (srcUrl) {
        const a = document.createElement("a");
        a.href = srcUrl;
        a.download = attachment.fileName;
        a.click();
        setDownloaded(true);
      }
    } finally {
      setDlBusy(false);
    }
  };

  const mediaReady = !loading && !error && !!srcUrl;
  const showNative = mediaReady && (isImg || isVid || isAud || isPDF);
  const showGeneric = mediaReady && !showNative;

  return (
    <aside className="fichat-info-panel fichat-preview-panel" style={{ width: panelWidth, maxWidth: 720 }}>
      <div className="fichat-info-resize" {...dragHandleProps} />

      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ height: 60, borderBottom: "1px solid var(--color-border)", background: "var(--color-header-bg)" }}
      >
        <button type="button" className="icon-btn" onClick={onClose} title="Fermer (Échap)">
          <Icon name="x" size={18} />
        </button>
        <span className="fichat-preview-chip shrink-0" style={{ backgroundColor: accent.bg, color: accent.fg }}>
          {accent.label.slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold truncate tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            {attachment.fileName}
          </h2>
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {[senderName, fileKindLabel(kind), formatFileSize(attachment.fileSize)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={(!srcUrl && loading) || dlBusy}
          className="icon-btn"
          style={{ color: downloaded ? "#16a34a" : "var(--color-primary-500)" }}
          title={downloaded ? "Téléchargé" : "Télécharger"}
        >
          {dlBusy ? (
            <Icon name="loader" size={16} className="animate-spin" />
          ) : downloaded ? (
            <Icon name="check" size={16} />
          ) : (
            <Icon name="download" size={16} />
          )}
        </button>
      </div>

      <div className="fichat-preview-body fichat-preview-body-panel">
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
            <p className="text-sm font-medium text-center" style={{ color: "var(--color-text-primary)" }}>{attachment.fileName}</p>
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
            <button
              type="button"
              className="fichat-preview-dl"
              onClick={handleDownload}
              disabled={dlBusy}
              style={downloaded ? { backgroundColor: "#16a34a" } : undefined}
            >
              <Icon name={downloaded ? "check" : "download"} size={15} />
              {downloaded ? "Téléchargé" : dlBusy ? "Enregistrement…" : "Télécharger"}
            </button>
          </div>
        )}
      </div>

      {downloaded && (
        <div className="fichat-preview-saved">
          <Icon name="check" size={14} />
          Enregistré dans Téléchargements
        </div>
      )}
    </aside>
  );
}

export const FilePreviewModal = FilePreviewPanel;
