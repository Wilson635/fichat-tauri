/** Format file size to human-readable string */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}

/** Get color for a file type badge */
export function getFileColor(mimeType: string | null): string {
  if (!mimeType) return "#6b7280";
  if (mimeType.startsWith("image/")) return "#3b82f6";
  if (mimeType === "application/pdf") return "#ef4444";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#2563eb";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("sheet")) return "#16a34a";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation")) return "#ea580c";
  if (mimeType.startsWith("video/")) return "#8b5cf6";
  if (mimeType.startsWith("audio/")) return "#ec4899";
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("archive") || mimeType.includes("compressed")) return "#78716c";
  if (mimeType.startsWith("text/")) return "#0891b2";
  return "#6b7280";
}

/** Get short extension label for badge */
/*export function getFileExt(fileName: string, mimeType?: string | null): string {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
  if (ext && ext.length <= 5) return ext;
  if (mimeType) {
    const sub = mimeType.split("/").pop()?.toUpperCase() ?? "";
    return sub.slice(0, 5) || "?";
  }
  return "?";
}*/

export function getFileExt(fileName: string | null | undefined, mimeType?: string | null): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
    if (ext && ext.length <= 5) return ext;
  }
  if (mimeType) {
    const sub = mimeType.split("/").pop()?.toUpperCase() ?? "";
    return sub.slice(0, 5) || "?";
  }
  return "?";
}

/** Whether a mime type is an image we can display inline */
export function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}

/** Whether a mime type is a video */
export function isVideo(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("video/");
}

/** Whether a mime type is audio */
export function isAudio(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith("audio/");
}

/** Whether a mime type is a PDF */
export function isPdf(mimeType: string | null): boolean {
  return mimeType === "application/pdf";
}

/**
 * Generate an image thumbnail (data URL) using Canvas.
 * Returns null if the file is not an image.
 */
export async function generateThumbnail(file: File, maxPx = 600): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  return new Promise<string | null>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Convert a File to base64 string (without the data:xxx;base64, prefix).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Erreur lecture fichier"));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a File to a data URL (includes the data:xxx;base64, prefix).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Erreur lecture fichier"));
    reader.readAsDataURL(file);
  });
}
