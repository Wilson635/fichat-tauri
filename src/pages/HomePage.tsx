import { useAuthStore } from "@/store/authStore";

export function HomePage() {
  const { user } = useAuthStore();

  return (
    // Use .chat-bg class so CSS variables --chat-bg-image and --chat-bg-size
    // from the selected chat background variant are applied correctly.
    <div className="chat-bg flex flex-col items-center justify-center h-full gap-4">
      <div className="text-center max-w-sm px-4">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "var(--color-surface-secondary)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-12 h-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ color: "var(--color-primary-500)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          Bienvenue, {user?.displayName?.split(" ")[0] ?? "Utilisateur"} !
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sélectionnez une conversation dans la barre latérale pour commencer à
          discuter, ou créez un nouveau groupe.
        </p>
        <div
          className="mt-6 flex items-center gap-2 justify-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Communications chiffrées de bout en bout
        </div>
      </div>
    </div>
  );
}
