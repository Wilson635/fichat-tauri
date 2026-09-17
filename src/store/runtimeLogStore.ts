import { create } from "zustand";
import { isTauri } from "@/services/chatService";

export interface RuntimeLog {
  id: number | string;
  timestamp: string;
  level: string;
  target: string;
  message: string;
  code?: string;
}

interface RuntimeLogState {
  entries: RuntimeLog[];
  live: boolean;
  ingest: (entry: RuntimeLog) => void;
  replaceAll: (entries: RuntimeLog[]) => void;
  setLive: (live: boolean) => void;
}

const MAX = 4000;

export const useRuntimeLogStore = create<RuntimeLogState>((set) => ({
  entries: [],
  live: true,
  ingest: (entry) =>
    set((s) => {
      if (s.entries.some((e) => e.id === entry.id)) return s;
      const next = s.entries.length >= MAX ? s.entries.slice(1) : s.entries;
      return { entries: [...next, entry] };
    }),
  replaceAll: (entries) => set({ entries: entries.slice(-MAX) }),
  setLive: (live) => set({ live }),
}));

function clientEntry(level: string, message: string, target = "ui"): RuntimeLog {
  return {
    id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    target,
    message,
  };
}

let started = false;

/** Capture backend tracing + UI console errors for the admin journal. */
export async function startRuntimeLogCapture(): Promise<void> {
  const w = window as Window & { __fichatLogCapture?: boolean };
  if (started || w.__fichatLogCapture) return;
  started = true;
  w.__fichatLogCapture = true;

  const ingest = (level: string, args: unknown[]) => {
    const message = args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
    useRuntimeLogStore.getState().ingest(clientEntry(level, message));
  };

  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    ingest("WARN", args);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    ingest("ERROR", args);
  };

  window.addEventListener("error", (e) => {
    useRuntimeLogStore.getState().ingest(
      clientEntry("ERROR", e.message || "window.onerror", e.filename || "ui"),
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    useRuntimeLogStore.getState().ingest(clientEntry("ERROR", `unhandledrejection: ${reason}`));
  });

  if (!isTauri()) return;
}

export function formatLogLine(e: RuntimeLog): string {
  const level = (e.level || "INFO").toUpperCase();
  return `${e.timestamp} ${level} ${e.target} :: ${e.message}`;
}
