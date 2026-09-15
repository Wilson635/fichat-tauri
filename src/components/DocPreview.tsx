import { useEffect, useState } from "react";
import type { AttachmentDto } from "@/services/chatService";
import {
  docAccent,
  fileKind,
  fileKindLabel,
  formatFileSize,
  getFileIcon,
  isTextLike,
} from "@/utils/fileUtils";
import { useAttachmentUrl, isInlineSrc } from "@/utils/attachmentUrl";
import { Icon } from "@/components/Icon";

type Variant = "overlay" | "bubble" | "tile";

interface VisualProps {
  fileName: string;
  mime?: string | null;
  fileSize?: number | null;
  thumbnail?: string | null;
  src?: string | null;
  textSnippet?: string | null;
  loading?: boolean;
  variant: Variant;
}

function FakeLines({ color }: { color: string }) {
  return (
    <div className="doc-sheet-lines" aria-hidden>
      {[92, 78, 86, 64, 88, 70, 80].map((w, i) => (
        <span key={i} style={{ width: `${w}%`, backgroundColor: color, opacity: 0.18 + (i % 3) * 0.06 }} />
      ))}
    </div>
  );
}

function OfficeSheet({ fileName, mime, variant }: { fileName: string; mime?: string | null; variant: Variant }) {
  const accent = docAccent(fileName, mime);
  const kind = fileKind(fileName, mime);
  return (
    <div className={`doc-sheet ${variant === "overlay" ? "is-lg" : ""}`} style={{ ["--doc-accent" as string]: accent.bg }}>
      <div className="doc-sheet-bar" style={{ backgroundColor: accent.bg }}>
        <span className="doc-sheet-brand" dangerouslySetInnerHTML={{ __html: getFileIcon(mime, fileName) }} />
        <span>{fileKindLabel(kind)}</span>
      </div>
      <div className="doc-sheet-page">
        <FakeLines color={accent.bg} />
      </div>
    </div>
  );
}

function TextPane({ text, overlay }: { text: string; overlay?: boolean }) {
  return (
    <pre className={`doc-text-pane ${overlay ? "is-overlay" : ""}`}>
      {text}
    </pre>
  );
}

export function FileVisualPreview({
  fileName,
  mime,
  thumbnail,
  src,
  textSnippet,
  loading,
  variant,
}: VisualProps) {
  const kind = fileKind(fileName, mime);
  const overlay = variant === "overlay";
  const cls = `doc-preview-surface is-${variant}`;

  if (loading) {
    return (
      <div className={cls}>
        <div className="doc-preview-fallback">
          <Icon name="loader" size={22} className="animate-spin" style={{ color: "var(--color-primary-500)" }} />
        </div>
      </div>
    );
  }

  if (kind === "image" && (thumbnail || src)) {
    return (
      <div className={cls}>
        <img src={thumbnail || src || ""} alt={fileName} />
      </div>
    );
  }

  if (kind === "video") {
    if (overlay && src) {
      return (
        <div className={cls}>
          <video src={src} controls playsInline preload="metadata" />
        </div>
      );
    }
    if (thumbnail) {
      return (
        <div className={cls}>
          <img src={thumbnail} alt={fileName} />
          <span className="doc-play-badge">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </div>
      );
    }
    return (
      <div className={cls}>
        <div className="doc-preview-fallback" style={{ color: "var(--color-text-muted)" }}>
          <Icon name="video" size={28} />
        </div>
      </div>
    );
  }

  if (kind === "audio" && overlay && src) {
    return (
      <div className={`${cls} is-audio`}>
        <div className="doc-audio-hero">
          <div className="icon-well" style={{ width: 56, height: 56, borderRadius: 16, background: "var(--color-active)", color: "var(--color-primary-600)" }}>
            <Icon name="mic" size={26} />
          </div>
          <p className="text-[13px] font-semibold mt-3" style={{ color: "var(--color-text-primary)" }}>{fileName}</p>
          <audio src={src} controls className="mt-4 w-full max-w-sm" />
        </div>
      </div>
    );
  }

  if (kind === "pdf" && src) {
    return (
      <div className={cls}>
        <iframe
          src={`${src}#page=1&toolbar=0&navpanes=0&scrollbar=0`}
          title={fileName}
          className="doc-pdf-frame"
        />
      </div>
    );
  }

  if ((kind === "text" || isTextLike(fileName, mime)) && textSnippet) {
    return (
      <div className={cls}>
        <TextPane text={textSnippet} overlay={overlay} />
      </div>
    );
  }

  return <OfficeSheet fileName={fileName} mime={mime} variant={variant} />;
}

export function AttachmentVisualPreview({
  attachment,
  variant,
  textSnippet,
}: {
  attachment: AttachmentDto;
  variant: Variant;
  textSnippet?: string | null;
}) {
  const kind = fileKind(attachment.fileName, attachment.fileType);
  const needsSrc = kind === "pdf" || kind === "text" || attachment.fileName.toLowerCase().endsWith(".csv");
  const inline = isInlineSrc(attachment.filePath) ? attachment.filePath : null;
  const { url, loading } = useAttachmentUrl(needsSrc && !inline ? attachment : null);
  const src = inline || url || null;

  const [fetchedText, setFetchedText] = useState<string | null>(textSnippet ?? null);

  useEffect(() => {
    if (textSnippet) {
      setFetchedText(textSnippet);
      return;
    }
    if (!src || !isTextLike(attachment.fileName, attachment.fileType)) return;
    let cancelled = false;
    fetch(src)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setFetchedText(t.slice(0, 900));
      })
      .catch(() => {
        if (!cancelled) setFetchedText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src, attachment.fileName, attachment.fileType, textSnippet]);

  return (
    <FileVisualPreview
      fileName={attachment.fileName}
      mime={attachment.fileType}
      fileSize={attachment.fileSize}
      thumbnail={attachment.thumbnail}
      src={src}
      textSnippet={fetchedText}
      loading={needsSrc && loading && !src}
      variant={variant}
    />
  );
}

export function DocMetaRow({
  fileName,
  mime,
  fileSize,
}: {
  fileName: string;
  mime?: string | null;
  fileSize?: number | null;
}) {
  const accent = docAccent(fileName, mime);
  const kind = fileKind(fileName, mime);
  return (
    <div className="doc-meta-row">
      <div className="doc-glyph" style={{ backgroundColor: accent.bg, color: accent.fg }}>
        {accent.label.slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-snug" style={{ color: "var(--color-text-primary)" }}>
          {fileName}
        </p>
        <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {fileKindLabel(kind)}
          {fileSize ? ` · ${formatFileSize(fileSize)}` : ""}
        </p>
      </div>
    </div>
  );
}
