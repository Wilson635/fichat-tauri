import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { Icon } from "@/components/Icon";
import { mailService, type MailMessage } from "@/services/mailService";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MailPage() {
  const { user } = useAuthStore();
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextFolder = folder) => {
    try {
      const rows = await mailService.list(nextFolder);
      setItems(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [folder]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const open = async (row: MailMessage) => {
    setCompose(false);
    setError(null);
    try {
      const full = await mailService.get(row.id);
      setSelected(full);
      setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, isRead: true } : m)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    if (!to.includes("@")) {
      setError("Indiquez un destinataire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mailService.send(to, subject, body);
      setTo("");
      setSubject("");
      setBody("");
      setCompose(false);
      setFolder("sent");
      await load("sent");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unread = useMemo(() => items.filter((m) => !m.isRead && folder === "inbox").length, [items, folder]);

  return (
    <div className="flex h-full min-h-0" style={{ backgroundColor: "var(--color-surface)" }}>
      <aside
        className="flex flex-col shrink-0 min-h-0"
        style={{ width: 340, borderRight: "1px solid var(--color-border)", backgroundColor: "var(--color-sidebar-bg)" }}
      >
        <div className="px-4 shrink-0 flex items-center justify-between" style={{ height: 60 }}>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Courrier</p>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Indépendant du chat{unread ? ` · ${unread} non lu${unread > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCompose(true); setSelected(null); setError(null); }}
            className="h-9 px-3 rounded-xl text-[12px] font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary-500)" }}
          >
            Nouveau
          </button>
        </div>
        <div className="px-3 pb-2 flex gap-1">
          {(["inbox", "sent"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFolder(f); setSelected(null); setCompose(false); }}
              className="flex-1 h-8 rounded-lg text-[12px] font-semibold"
              style={{
                backgroundColor: folder === f ? "var(--color-active)" : "transparent",
                color: folder === f ? "var(--color-text-primary)" : "var(--color-text-muted)",
              }}
            >
              {f === "inbox" ? "Boîte de réception" : "Envoyés"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {items.length === 0 && (
            <p className="text-sm text-center py-10 px-4" style={{ color: "var(--color-text-muted)" }}>
              {folder === "inbox"
                ? "Aucun courrier. Les e-mails entre collègues FiEcho arrivent ici même si Zimbra est arrêté."
                : "Aucun message envoyé."}
            </p>
          )}
          {items.map((m) => {
            const on = selected?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => open(m)}
                className="w-full text-left px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: on ? "var(--color-active)" : "transparent" }}
              >
                <div className="flex items-center gap-2">
                  {!m.isRead && folder === "inbox" && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-primary-500)" }} />
                  )}
                  <span className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                    {folder === "sent" ? m.toEmail : m.fromEmail}
                  </span>
                  <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {formatWhen(m.createdAt)}
                  </span>
                </div>
                <p className="text-[13px] truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{m.subject}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        {error && (
          <p className="mx-5 mt-4 text-[13px] px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
            {error}
          </p>
        )}
        {compose ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Nouveau message</h2>
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Destinataire FiEcho (@firsttrust.cm) : livraison directe, sans Zimbra.
              Adresse externe : file d’attente SMTP jusqu’à ce qu’un relais réponde.
            </p>
            <label className="block">
              <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>À</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
                style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                placeholder="prenom.nom@firsttrust.cm"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Objet</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
                style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-52 p-3 rounded-xl text-[13px] border outline-none resize-y"
              style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              placeholder="Votre message…"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="h-10 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--color-primary-500)" }}
              >
                {busy ? "Envoi…" : "Envoyer"}
              </button>
              <button
                type="button"
                onClick={() => setCompose(false)}
                className="h-10 px-4 rounded-xl text-[13px] font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Annuler
              </button>
            </div>
            {user?.email && (
              <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Expéditeur : {user.email}</p>
            )}
          </div>
        ) : selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-[12px] font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
              {formatWhen(selected.createdAt)}
            </p>
            <h2 className="text-[20px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
              {selected.subject}
            </h2>
            <p className="text-[13px] mb-1" style={{ color: "var(--color-text-secondary)" }}>
              De {selected.fromEmail}
            </p>
            <p className="text-[13px] mb-5" style={{ color: "var(--color-text-secondary)" }}>
              À {selected.toEmail}
            </p>
            <pre className="text-[14px] leading-relaxed whitespace-pre-wrap font-sans" style={{ color: "var(--color-text-primary)" }}>
              {selected.bodyText}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <Icon name="mail" size={36} style={{ color: "var(--color-text-muted)" }} />
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Messagerie FiEcho</p>
            <p className="text-sm max-w-md" style={{ color: "var(--color-text-muted)" }}>
              Le chat reste inchangé. Cette boîte reçoit le courrier livré à FiEcho.
              Les messages déjà stockés sur Zimbra ne peuvent y arriver que si Zimbra est restauré, ou si le DNS MX pointe vers la passerelle FiEcho.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
