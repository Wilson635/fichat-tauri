import { create } from "zustand";
import type { MessageDto } from "@/services/chatService";

interface PendingAction {
  conversationId: number;
  message: MessageDto;
}

interface MessageActionState {
  pendingEdit: PendingAction | null;
  pendingDelete: PendingAction | null;
  openEdit: (conversationId: number, message: MessageDto) => void;
  openDelete: (conversationId: number, message: MessageDto) => void;
  closeEdit: () => void;
  closeDelete: () => void;
}

export const useMessageActionStore = create<MessageActionState>((set) => ({
  pendingEdit: null,
  pendingDelete: null,
  openEdit: (conversationId, message) =>
    set({ pendingEdit: { conversationId, message } }),
  openDelete: (conversationId, message) =>
    set({ pendingDelete: { conversationId, message } }),
  closeEdit: () => set({ pendingEdit: null }),
  closeDelete: () => set({ pendingDelete: null }),
}));
