import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/store/notificationStore";
import { Icon } from "@/components/Icon";

export function PriorityNotificationModal() {
  const { pendingPriority, dismissPriority } = useNotificationStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingPriority) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissPriority();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        dismissPriority();
        navigate(`/conversations/${pendingPriority.conversationId}`);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingPriority, dismissPriority, navigate]);

  if (!pendingPriority) return null;

  const handleOpen = () => {
    const id = pendingPriority.conversationId;
    dismissPriority();
    navigate(`/conversations/${id}`);
  };

  return createPortal(
    <div className="fichat-priority-overlay" role="presentation">
      <div
        className="fichat-priority-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fichat-priority-title"
      >
        <div className="fichat-priority-head">
          <div className="fichat-priority-well" aria-hidden>
            <Icon name="bell" size={22} />
          </div>
          <div>
            <span className="fichat-priority-kicker">Message prioritaire</span>
            <p className="fichat-priority-brand" id="fichat-priority-title">
              FiChat
            </p>
          </div>
        </div>

        <div className="fichat-priority-body">
          <p className="fichat-priority-conv">{pendingPriority.conversationName}</p>
          {pendingPriority.senderName ? (
            <p className="fichat-priority-sender">{pendingPriority.senderName}</p>
          ) : null}
          <p className="fichat-priority-msg">{pendingPriority.content}</p>
        </div>

        <div className="fichat-priority-actions">
          <button type="button" className="fichat-priority-ghost" onClick={dismissPriority}>
            Ignorer
          </button>
          <button type="button" className="fichat-priority-primary" onClick={handleOpen} autoFocus>
            Ouvrir la conversation
          </button>
        </div>
        <p className="fichat-priority-hint">Entrée pour ouvrir · Échap pour ignorer</p>
      </div>
    </div>,
    document.body,
  );
}
