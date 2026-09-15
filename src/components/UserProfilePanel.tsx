import { ConversationInfoPanel } from "@/components/ConversationInfoPanel";
import { useChatStore } from "@/store/chatStore";
import type { ParticipantInfo } from "@/services/chatService";

interface Props {
  participant: ParticipantInfo;
  conversationId?: number;
  onClose: () => void;
  onSendMessage?: () => void;
}

export function UserProfilePanel({ conversationId, onClose }: Props) {
  const conversation = useChatStore((s) =>
    conversationId ? s.conversations.find((c) => c.id === conversationId) : undefined,
  );
  if (!conversation) return null;
  return <ConversationInfoPanel conversation={conversation} onClose={onClose} />;
}
