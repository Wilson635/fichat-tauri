import { create } from "zustand";

export type AppToast = {
  id: number;
  title: string;
  detail?: string;
  kind: "success" | "error" | "info";
};

let seq = 1;

interface ToastState {
  toasts: AppToast[];
  push: (toast: Omit<AppToast, "id">, ms?: number) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast, ms = 4500) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
