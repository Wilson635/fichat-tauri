import { useToastStore } from "@/store/toastStore";
import { Icon } from "@/components/Icon";

export function AppToasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div className="fichat-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`fichat-toast is-${t.kind}`}>
          <div className="fichat-toast-icon">
            <Icon
              name={t.kind === "error" ? "alert" : t.kind === "info" ? "info" : "check"}
              size={16}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="fichat-toast-title">{t.title}</p>
            {t.detail && <p className="fichat-toast-detail">{t.detail}</p>}
          </div>
          <button type="button" className="icon-btn shrink-0" onClick={() => dismiss(t.id)} title="Fermer">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
