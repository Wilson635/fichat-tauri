import { useAuthStore } from "@/store/authStore";
import { Icon } from "@/components/Icon";

export function HomePage() {
  const { user } = useAuthStore();

  return (
    <div className="chat-bg flex flex-col items-center justify-center h-full gap-4">
      <div className="text-center max-w-sm px-4">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
          }}
        >
          <Icon name="message" size={36} style={{ color: "var(--color-primary-500)" }} strokeWidth={1.6} />
        </div>
        <h2 className="text-xl font-semibold mb-2 tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Bonjour, {user?.displayName?.split(" ")[0] ?? "Utilisateur"}
        </h2>
        <p className="text-sm leading-relaxed font-medium" style={{ color: "var(--color-text-muted)" }}>
          Choisissez une conversation ou démarrez une nouvelle discussion depuis la barre latérale.
        </p>
        <div className="mt-6 flex items-center gap-2 justify-center text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
          <Icon name="lock" size={13} />
          Communications d’entreprise sécurisées
        </div>
      </div>
    </div>
  );
}
