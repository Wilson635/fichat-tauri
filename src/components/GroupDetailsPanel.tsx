import { ConversationInfoPanel } from "@/components/ConversationInfoPanel";
import type { ConversationSummary } from "@/services/chatService";

interface Props {
  conversation: ConversationSummary;
  onClose: () => void;
}

export function GroupDetailsPanel({ conversation, onClose }: Props) {
  return <ConversationInfoPanel conversation={conversation} onClose={onClose} />;
}
