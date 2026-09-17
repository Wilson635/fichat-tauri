import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useNotificationStore } from "@/store/notificationStore";
import { Icon } from "@/components/Icon";
import { APP_NAME } from "@/brand";

export function PriorityNotificationModal() {
  const { pendingPriority, dismissPriority } = useNotificationStore();
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!pendingPriority) {
      setArmed(false);
      return;
    }
    setArmed(false);
    const timer = window.setTimeout(() => setArmed(true), 900);
    return () => window.clearTimeout(timer);
  }, [pendingPriority]);

  useEffect(() => {
    if (!pendingPriority) return;
    const handleKey = (e: KeyboardEvent) => {
      if (!armed) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismissPriority();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        dismissPriority();
        if (pendingPriority.conversationId > 0) {
          navigate(`/conversations/${pendingPriority.conversationId}`);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingPriority, dismissPriority, navigate, armed]);

  if (!pendingPriority) return null;

  const canOpen = pendingPriority.conversationId > 0;

  const handleOpen = () => {
    if (!armed) return;
    const id = pendingPriority.conversationId;
    dismissPriority();
    if (id > 0) navigate(`/conversations/${id}`);
  };

  return createPortal(
    <div
      className="fichat-priority-overlay"
      role="presentation"
      style={{ pointerEvents: armed ? undefined : "none" }}
    >
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
              {APP_NAME}
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
          <button
            type="button"
            className="fichat-priority-ghost"
            onClick={() => armed && dismissPriority()}
            autoFocus={armed && !canOpen}
          >
            {canOpen ? "Ignorer" : "J'ai compris"}
          </button>
          {canOpen ? (
            <button
              type="button"
              className="fichat-priority-primary"
              onClick={handleOpen}
              autoFocus={armed}
            >
              Ouvrir la conversation
            </button>
          ) : null}
        </div>
        <p className="fichat-priority-hint">
          {canOpen ? "Entrée pour ouvrir · Échap pour ignorer" : "Entrée ou Échap pour fermer"}
        </p>
      </div>
    </div>,
    document.body,
  );
}
