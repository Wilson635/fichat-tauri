import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { FileVisualPreview, DocMetaRow } from "@/components/DocPreview";
import { fileKind, fileKindLabel, formatFileSize, isImage, isVideo } from "@/utils/fileUtils";

export interface PendingShare {
  file: File;
  thumbnail: string | null;
  dataUrl: string;
  previewUrl: string;
  textSnippet: string | null;
}

interface Props {
  pending: PendingShare;
  onCancel: () => void;
}

export function SendFileOverlay({ pending, onCancel }: Props) {
  const { file, thumbnail, previewUrl, textSnippet } = pending;
  const kind = fileKind(file.name, file.type);
  const media = isImage(file.type, file.name) || isVideo(file.type, file.name);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  return (
    <div className="fichat-send-stage" aria-label="Fichier prêt à envoyer">
      <div className="fichat-send-stage-head">
        <div className="icon-well">
          <Icon name={media ? "image" : "paperclip"} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Prêt à envoyer
          </p>
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {fileKindLabel(kind)} · {formatFileSize(file.size)} · Entrée pour partager
          </p>
        </div>
        <button type="button" className="icon-btn shrink-0" onClick={onCancel} title="Retirer le fichier">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className={`fichat-send-stage-body ${media ? "is-media" : ""}`}>
        <FileVisualPreview
          fileName={file.name}
          mime={file.type}
          fileSize={file.size}
          thumbnail={thumbnail}
          src={previewUrl}
          textSnippet={textSnippet}
          variant="overlay"
        />
      </div>
      <div className="fichat-send-stage-meta">
        <DocMetaRow fileName={file.name} mime={file.type} fileSize={file.size} />
      </div>
    </div>
  );
}
