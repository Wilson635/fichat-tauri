import { useEffect, useState } from "react";
import type { AttachmentDto } from "@/services/chatService";
import { chatService, isTauri } from "@/services/chatService";

const blobCache = new Map<number, string>();
const inflight = new Map<number, Promise<string>>();

export function isInlineSrc(path: string | null | undefined): boolean {
  if (!path) return false;
  return (
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  );
}

export function base64ToBlob(b64Data: string, contentType = "application/octet-stream", sliceSize = 512): Blob {
  const byteCharacters = atob(b64Data);
  const byteArrays: BlobPart[] = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

function guessMime(att: AttachmentDto): string {
  if (att.fileType && att.fileType !== "application/octet-stream") return att.fileType;
  const name = att.fileName.toLowerCase();
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".ogg") || name.endsWith(".oga")) return "audio/ogg";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".m4a") || name.endsWith(".mp4")) return name.includes("voice") || name.startsWith("message-vocal") ? "audio/mp4" : "video/mp4";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  return att.fileType || "application/octet-stream";
}

/**
 * Resolve a playable/downloadable object URL for any participant.
 * Inline data URLs (web mock / optimistic send) are used as-is.
 * Otherwise the file is loaded from the shared database by attachment id.
 */
export async function getAttachmentObjectUrl(att: AttachmentDto): Promise<string> {
  if (isInlineSrc(att.filePath)) return att.filePath;
  if (att.thumbnail && isInlineSrc(att.thumbnail) && (att.fileType ?? "").startsWith("image/")) {
    // Thumbnail is enough for image bubbles; full file is fetched on open.
  }
  if (att.id > 0 && blobCache.has(att.id)) return blobCache.get(att.id)!;
  if (att.id > 0 && inflight.has(att.id)) return inflight.get(att.id)!;

  const load = async (): Promise<string> => {
    if (!isTauri()) {
      if (isInlineSrc(att.filePath)) return att.filePath;
      throw new Error("Fichier inaccessible");
    }
    const data = await chatService.getAttachmentData(att.id);
    const mime = data.fileType || guessMime(att);
    const blob = base64ToBlob(data.base64, mime);
    const url = URL.createObjectURL(blob);
    if (att.id > 0) blobCache.set(att.id, url);
    return url;
  };

  if (att.id <= 0) {
    if (isInlineSrc(att.filePath)) return att.filePath;
    throw new Error("Pièce jointe non persistée");
  }

  const promise = load().finally(() => inflight.delete(att.id));
  inflight.set(att.id, promise);
  return promise;
}

export async function downloadAttachment(att: AttachmentDto): Promise<void> {
  const url = await getAttachmentObjectUrl(att);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function previewSrc(att: AttachmentDto): string | null {
  if (att.thumbnail && isInlineSrc(att.thumbnail)) return att.thumbnail;
  if (isInlineSrc(att.filePath)) return att.filePath;
  return null;
}

export function useAttachmentUrl(att: AttachmentDto | null, preferPreview = false) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!att) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (preferPreview) {
      const p = previewSrc(att);
      if (p) {
        setUrl(p);
        setLoading(false);
        setError(null);
        return;
      }
    }
    if (isInlineSrc(att.filePath)) {
      setUrl(att.filePath);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAttachmentObjectUrl(att)
      .then((u) => {
        if (!cancelled) setUrl(u);
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
  }, [att?.id, att?.filePath, att?.thumbnail, att?.fileType, preferPreview]);

  return { url, loading, error };
}
