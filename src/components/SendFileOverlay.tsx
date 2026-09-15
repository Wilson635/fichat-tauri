import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { FileVisualPreview, DocMetaRow } from "@/components/DocPreview";
import { fileKind, fileKindLabel, formatFileSize } from "@/utils/fileUtils";

export interface PendingShare {
  file: File;
  thumbnail: string | null;
  dataUrl: string;
  previewUrl: string;
  textSnippet: string | null;
}

interface Props {
  pending: PendingShare;
  caption: string;
  onCaption: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function SendFileOverlay({ pending, caption, onCaption, onSend, onCancel }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { file, thumbnail, previewUrl, textSnippet } = pending;
  const kind = fileKind(file.name, file.type);

  useEffect(() => {
    inputRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  const title =
    kind === "image"
      ? "Aperçu de l’image"
      : kind === "video"
        ? "Aperçu de la vidéo"
        : kind === "audio"
          ? "Aperçu audio"
          : "Aperçu du document";

  return createPortal(
    <div className="fichat-send-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fichat-send-card">
        <header className="fichat-send-head">
          <button type="button" className="icon-btn" onClick={onCancel} title="Annuler">
            <Icon name="x" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2>{title}</h2>
            <p>
              {fileKindLabel(kind)} · {formatFileSize(file.size)}
            </p>
          </div>
          <span className="fichat-send-chip">{fileKindLabel(kind)}</span>
        </header>

        <div className="fichat-send-body">
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

        <footer className="fichat-send-foot">
          <DocMetaRow fileName={file.name} mime={file.type} fileSize={file.size} />
          <div className="fichat-send-compose">
            <textarea
              ref={inputRef}
              value={caption}
              onChange={(e) => onCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              rows={1}
              placeholder="Ajouter une légende… (optionnel)"
              className="fichat-send-caption"
            />
            <button type="button" className="composer-send" onClick={onSend} title="Envoyer">
              <Icon name="send" size={16} />
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
