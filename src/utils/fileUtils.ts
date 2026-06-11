/** Format file size to human-readable string */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}

/** Background color for the file icon badge */
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

/**
 * Returns a JSX-ready SVG icon string for the given MIME type.
 * Use with dangerouslySetInnerHTML or render via getFileIconElement().
 */
export function getFileIcon(mimeType: string | null | undefined): string {
  if (!mimeType) return iconGeneric;

  if (mimeType.startsWith("image/"))       return iconImage;
  if (mimeType === "application/pdf")       return iconPdf;
  if (mimeType.startsWith("video/"))        return iconVideo;
  if (mimeType.startsWith("audio/"))        return iconAudio;
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("archive") || mimeType.includes("compressed"))
    return iconArchive;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return iconWord;
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("sheet"))
    return iconExcel;
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation"))
    return iconPowerpoint;
  if (mimeType.startsWith("text/"))          return iconText;

  return iconGeneric;
}

// ─── SVG icon strings (24×24 viewBox, stroke-based, white) ───────────────────

const iconImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <circle cx="8.5" cy="8.5" r="1.5" fill="white" stroke="none"/>
  <path d="M21 15l-5-5L5 21"/>
</svg>`;

const iconPdf = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
\t<path d="M0 0h24v24H0z" fill="none" />
\t<path fill="#ef5350" d="M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m4.93 10.44c.41.9.93 1.64 1.53 2.15l.41.32c-.87.16-2.07.44-3.34.93l-.11.04l.5-1.04c.45-.87.78-1.66 1.01-2.4m6.48 3.81c.18-.18.27-.41.28-.66c.03-.2-.02-.39-.12-.55c-.29-.47-1.04-.69-2.28-.69l-1.29.07l-.87-.58c-.63-.52-1.2-1.43-1.6-2.56l.04-.14c.33-1.33.64-2.94-.02-3.6a.85.85 0 0 0-.61-.24h-.24c-.37 0-.7.39-.79.77c-.37 1.33-.15 2.06.22 3.27v.01c-.25.88-.57 1.9-1.08 2.93l-.96 1.8l-.89.49c-1.2.75-1.77 1.59-1.88 2.12c-.04.19-.02.36.05.54l.03.05l.48.31l.44.11c.81 0 1.73-.95 2.97-3.07l.18-.07c1.03-.33 2.31-.56 4.03-.75c1.03.51 2.24.74 3 .74c.44 0 .74-.11.91-.3m-.41-.71l.09.11c-.01.1-.04.11-.09.13h-.04l-.19.02c-.46 0-1.17-.19-1.9-.51c.09-.1.13-.1.23-.1c1.4 0 1.8.25 1.9.35M7.83 17c-.65 1.19-1.24 1.85-1.69 2c.05-.38.5-1.04 1.21-1.69zm3.02-6.91c-.23-.9-.24-1.63-.07-2.05l.07-.12l.15.05c.17.24.19.56.09 1.1l-.03.16l-.16.82z" />
</svg>

`;

const iconWord = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32">
\t<path d="M0 0h32v32H0z" fill="none" />
\t<defs>
\t\t<linearGradient id="SVG2m3AVb6p" x1="4.494" x2="13.832" y1="-1712.086" y2="-1695.914" gradientTransform="translate(0 1720)" gradientUnits="userSpaceOnUse">
\t\t\t<stop offset="0" stop-color="#2368c4" />
\t\t\t<stop offset=".5" stop-color="#1a5dbe" />
\t\t\t<stop offset="1" stop-color="#1146ac" />
\t\t</linearGradient>
\t</defs>
\t<path fill="#41a5ee" d="M28.806 3H9.705a1.19 1.19 0 0 0-1.193 1.191V9.5l11.069 3.25L30 9.5V4.191A1.19 1.19 0 0 0 28.806 3" />
\t<path fill="#2b7cd3" d="M30 9.5H8.512V16l11.069 1.95L30 16Z" />
\t<path fill="#185abd" d="M8.512 16v6.5l10.418 1.3L30 22.5V16Z" />
\t<path fill="#103f91" d="M9.705 29h19.1A1.19 1.19 0 0 0 30 27.809V22.5H8.512v5.309A1.19 1.19 0 0 0 9.705 29" />
\t<path d="M16.434 8.2H8.512v16.25h7.922a1.2 1.2 0 0 0 1.194-1.191V9.391A1.2 1.2 0 0 0 16.434 8.2" opacity=".1" />
\t<path d="M15.783 8.85H8.512V25.1h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path d="M15.783 8.85H8.512V23.8h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path d="M15.132 8.85h-6.62V23.8h6.62a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path fill="url(#SVG2m3AVb6p)" d="M3.194 8.85h11.938a1.193 1.193 0 0 1 1.194 1.191v11.918a1.193 1.193 0 0 1-1.194 1.191H3.194A1.19 1.19 0 0 1 2 21.959V10.041A1.19 1.19 0 0 1 3.194 8.85" />
\t<path fill="#fff" d="M6.9 17.988q.035.276.046.481h.028q.015-.195.065-.47c.05-.275.062-.338.089-.465l1.255-5.407h1.624l1.3 5.326a8 8 0 0 1 .162 1h.022a8 8 0 0 1 .135-.975l1.039-5.358h1.477l-1.824 7.748h-1.727l-1.237-5.126q-.054-.222-.122-.578t-.084-.52h-.021q-.021.189-.084.561t-.1.552L7.78 19.871H6.024L4.19 12.127h1.5l1.131 5.418a5 5 0 0 1 .079.443" />
</svg>

`;

const iconExcel = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32">
\t<path d="M0 0h32v32H0z" fill="none" />
\t<defs>
\t\t<linearGradient id="SVGSuUii0pt" x1="4.494" x2="13.832" y1="-2092.086" y2="-2075.914" gradientTransform="translate(0 2100)" gradientUnits="userSpaceOnUse">
\t\t\t<stop offset="0" stop-color="#18884f" />
\t\t\t<stop offset=".5" stop-color="#117e43" />
\t\t\t<stop offset="1" stop-color="#0b6631" />
\t\t</linearGradient>
\t</defs>
\t<path fill="#185c37" d="M19.581 15.35L8.512 13.4v14.409A1.19 1.19 0 0 0 9.705 29h19.1A1.19 1.19 0 0 0 30 27.809V22.5Z" />
\t<path fill="#21a366" d="M19.581 3H9.705a1.19 1.19 0 0 0-1.193 1.191V9.5L19.581 16l5.861 1.95L30 16V9.5Z" />
\t<path fill="#107c41" d="M8.512 9.5h11.069V16H8.512Z" />
\t<path d="M16.434 8.2H8.512v16.25h7.922a1.2 1.2 0 0 0 1.194-1.191V9.391A1.2 1.2 0 0 0 16.434 8.2" opacity=".1" />
\t<path d="M15.783 8.85H8.512V25.1h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path d="M15.783 8.85H8.512V23.8h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path d="M15.132 8.85h-6.62V23.8h6.62a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity=".2" />
\t<path fill="url(#SVGSuUii0pt)" d="M3.194 8.85h11.938a1.193 1.193 0 0 1 1.194 1.191v11.918a1.193 1.193 0 0 1-1.194 1.191H3.194A1.19 1.19 0 0 1 2 21.959V10.041A1.19 1.19 0 0 1 3.194 8.85" />
\t<path fill="#fff" d="m5.7 19.873l2.511-3.884l-2.3-3.862h1.847L9.013 14.6c.116.234.2.408.238.524h.017q.123-.281.26-.546l1.342-2.447h1.7l-2.359 3.84l2.419 3.905h-1.809l-1.45-2.711A2.4 2.4 0 0 1 9.2 16.8h-.024a1.7 1.7 0 0 1-.168.351l-1.493 2.722Z" />
\t<path fill="#33c481" d="M28.806 3h-9.225v6.5H30V4.191A1.19 1.19 0 0 0 28.806 3" />
\t<path fill="#107c41" d="M19.581 16H30v6.5H19.581Z" />
</svg>

`;

const iconPowerpoint = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32">
\t<path d="M0 0h32v32H0z" fill="none" />
\t<defs>
\t\t<linearGradient id="SVGNTQfxeQw" x1="4.494" x2="13.832" y1="-1748.086" y2="-1731.914" gradientTransform="translate(0 1756)" gradientUnits="userSpaceOnUse">
\t\t\t<stop offset="0" stop-color="#ca4c28" />
\t\t\t<stop offset=".5" stop-color="#c5401e" />
\t\t\t<stop offset="1" stop-color="#b62f14" />
\t\t</linearGradient>
\t</defs>
\t<path fill="#ed6c47" d="M18.93 17.3L16.977 3h-.146A12.9 12.9 0 0 0 3.953 15.854V16Z" />
\t<path fill="#ff8f6b" d="M17.123 3h-.146v13l6.511 2.6L30 16v-.146A12.9 12.9 0 0 0 17.123 3" />
\t<path fill="#d35230" d="M30 16v.143A12.905 12.905 0 0 1 17.12 29h-.287a12.907 12.907 0 0 1-12.88-12.857V16Z" />
\t<path d="M17.628 9.389V23.26a1.2 1.2 0 0 1-.742 1.1a1.2 1.2 0 0 1-.45.091H7.027a10 10 0 0 1-.521-.65a12.74 12.74 0 0 1-2.553-7.657v-.286A12.7 12.7 0 0 1 6.05 8.85a9 9 0 0 1 .456-.65h9.93a1.2 1.2 0 0 1 1.192 1.189" opacity=".1" />
\t<path d="M16.977 10.04v13.871a1.2 1.2 0 0 1-.091.448a1.2 1.2 0 0 1-1.1.741H7.62q-.309-.314-.593-.65a10 10 0 0 1-.521-.65a12.74 12.74 0 0 1-2.553-7.657v-.286A12.7 12.7 0 0 1 6.05 8.85h9.735a1.2 1.2 0 0 1 1.192 1.19" opacity=".2" />
\t<path d="M16.977 10.04v12.571a1.2 1.2 0 0 1-1.192 1.189H6.506a12.74 12.74 0 0 1-2.553-7.657v-.286A12.7 12.7 0 0 1 6.05 8.85h9.735a1.2 1.2 0 0 1 1.192 1.19" opacity=".2" />
\t<path d="M16.326 10.04v12.571a1.2 1.2 0 0 1-1.192 1.189H6.506a12.74 12.74 0 0 1-2.553-7.657v-.286A12.7 12.7 0 0 1 6.05 8.85h9.084a1.2 1.2 0 0 1 1.192 1.19" opacity=".2" />
\t<path fill="url(#SVGNTQfxeQw)" d="M3.194 8.85h11.938a1.193 1.193 0 0 1 1.194 1.191v11.918a1.193 1.193 0 0 1-1.194 1.191H3.194A1.19 1.19 0 0 1 2 21.959V10.041A1.19 1.19 0 0 1 3.194 8.85" />
\t<path fill="#fff" d="M9.293 12.028a3.3 3.3 0 0 1 2.174.636a2.27 2.27 0 0 1 .756 1.841a2.56 2.56 0 0 1-.373 1.376a2.5 2.5 0 0 1-1.059.935a3.6 3.6 0 0 1-1.591.334H7.687v2.8H6.141v-7.922ZM7.686 15.94h1.331a1.74 1.74 0 0 0 1.177-.351a1.3 1.3 0 0 0 .4-1.025q0-1.309-1.525-1.31H7.686z" />
</svg>

`;

const iconVideo = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
\t<path d="M0 0h24v24H0z" fill="none" />
\t<path fill="currentColor" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12c0 1.6.376 3.112 1.043 4.453c.178.356.237.763.134 1.148l-.595 2.226a1.3 1.3 0 0 0 1.591 1.592l2.226-.596a1.63 1.63 0 0 1 1.149.133A9.96 9.96 0 0 0 12 22" opacity=".5" />
\t<path fill="currentColor" d="M13.22 9.447C15.073 10.586 16 11.156 16 12c0 .845-.927 1.414-2.78 2.553c-1.88 1.155-2.819 1.732-3.52 1.308C9 15.437 9 14.291 9 12s0-3.437.7-3.861c.701-.424 1.64.153 3.52 1.308" />
</svg>

`;

const iconAudio = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 48 48">
\t<path d="M0 0h48v48H0z" fill="none" />
\t<path fill="none" d="M204 0h48v48h-48z" />
\t<path fill="#90CAF9" d="M244 45h-32V3h22l10 10z" />
\t<path fill="#E1F5FE" d="M242.5 14H233V4.5z" />
\t<g fill="#1976D2">
\t\t<circle cx="227" cy="30" r="4" />
\t\t<path d="m234 21l-5-2v11h2v-7.1l3 1.1z" />
\t</g>
\t<path fill="#90CAF9" d="M40 45H8V3h22l10 10z" />
\t<path fill="#E1F5FE" d="M38.5 14H29V4.5z" />
\t<g fill="#1976D2">
\t\t<circle cx="23" cy="30" r="4" />
\t\t<path d="m30 21l-5-2v11h2v-7.1l3 1.1z" />
\t</g>
</svg>

`;

const iconArchive = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
\t<path d="M0 0h24v24H0z" fill="none" />
\t<path fill="currentColor" d="m12 17.192l3.308-3.307l-.708-.708l-2.1 2.1v-4.7h-1v4.7l-2.1-2.1l-.708.708zM5.77 20q-.672 0-1.221-.549T4 18.231V7.486q0-.292.093-.55t.28-.475l1.558-1.87q.217-.293.543-.442T7.173 4h9.616q.372 0 .708.149t.553.441l1.577 1.91q.187.217.28.485q.093.267.093.56V18.23q0 .671-.549 1.22t-1.22.549zM5.38 6.808H18.6L17.27 5.21q-.097-.096-.222-.153T16.788 5H7.192q-.134 0-.26.058t-.22.154z" />
</svg>

`;

const iconText = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
\t<path d="M0 0h24v24H0z" fill="none" />
\t<path fill="currentColor" fill-rule="evenodd" d="M14 22h-4c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14v-4c0-3.771 0-5.657 1.172-6.828S6.239 2 10.03 2c.606 0 1.091 0 1.5.017q-.02.12-.02.244l-.01 2.834c0 1.097 0 2.067.105 2.848c.114.847.375 1.694 1.067 2.386c.69.69 1.538.952 2.385 1.066c.781.105 1.751.105 2.848.105h4.052c.043.534.043 1.19.043 2.063V14c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22" clip-rule="evenodd" opacity=".5" />
\t<path fill="currentColor" d="M6 13.75a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 3.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5zm5.51-14.99l-.01 2.835c0 1.097 0 2.066.105 2.848c.114.847.375 1.694 1.067 2.385c.69.691 1.538.953 2.385 1.067c.781.105 1.751.105 2.848.105h4.052q.02.232.028.5H22c0-.268 0-.402-.01-.56a5.3 5.3 0 0 0-.958-2.641c-.094-.128-.158-.204-.285-.357C19.954 7.494 18.91 6.312 18 5.5c-.81-.724-1.921-1.515-2.89-2.161c-.832-.556-1.248-.834-1.819-1.04a6 6 0 0 0-.506-.154c-.384-.095-.758-.128-1.285-.14z" />
</svg>

`;

const iconGeneric = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
</svg>`;

/** Get short extension label for badge (fallback si pas d'icône) */
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