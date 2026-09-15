import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export interface CreatedLocalUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  role: string;
  isActive: boolean;
  presenceStatus: string;
  lastSeen: string | null;
  authSource: string;
}

interface CreateProps {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    username: string;
    displayName: string;
    email: string;
    department: string;
    password: string;
    role: "user" | "system_admin";
  }) => void;
}

const fieldStyle = {
  backgroundColor: "var(--color-input-bg)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
} as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function CreateUserModal({ busy, error, onClose, onSubmit }: CreateProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"user" | "system_admin">("user");
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Les mots de passe ne correspondent pas.");
      return;
    }
    onSubmit({ username, displayName, email, department, password, role });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: "var(--color-header-bg)" }}>
          <div>
            <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Nouveau compte local</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Pour un collaborateur absent de l’Active Directory.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="icon-btn">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Identifiant">
              <input
                required
                minLength={3}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
                style={fieldStyle}
                placeholder="j.dupont"
                spellCheck={false}
              />
            </Field>
            <Field label="Nom affiché">
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
                style={fieldStyle}
                placeholder="Jean Dupont"
              />
            </Field>
          </div>
          <Field label="E-mail (optionnel)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
              style={fieldStyle}
              placeholder="j.dupont@firsttrust.cm"
            />
          </Field>
          <Field label="Département (optionnel)">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
              style={fieldStyle}
              placeholder="Comptabilité"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mot de passe">
              <div className="relative">
                <input
                  required
                  minLength={8}
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 pr-9 rounded-xl text-[13px] border outline-none"
                  style={fieldStyle}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShow((v) => !v)}
                  tabIndex={-1}
                >
                  <Icon name={show ? "eyeOff" : "eye"} size={14} style={{ color: "var(--color-text-muted)" }} />
                </button>
              </div>
            </Field>
            <Field label="Confirmation">
              <input
                required
                minLength={8}
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
                style={fieldStyle}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Field label="Rôle">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "system_admin")}
              className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
              style={fieldStyle}
            >
              <option value="user">Utilisateur</option>
              <option value="system_admin">Administrateur</option>
            </select>
          </Field>

          {(localError || error) && (
            <p className="text-[12px] px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
              {localError || error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 flex justify-end gap-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-xl text-[13px] font-semibold border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-10 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-primary-500)" }}
          >
            {busy ? "Création…" : "Créer le compte"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface ResetProps {
  username: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

export function ResetPasswordModal({ username, busy, error, onClose, onSubmit }: ResetProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Les mots de passe ne correspondent pas.");
      return;
    }
    onSubmit(password);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: "var(--color-header-bg)" }}>
          <h2 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Réinitialiser le mot de passe
          </h2>
          <button type="button" onClick={onClose} disabled={busy} className="icon-btn">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Nouveau mot de passe pour <strong style={{ color: "var(--color-text-primary)" }}>{username}</strong>.
            La session en cours de cet utilisateur sera invalidée.
          </p>
          <Field label="Nouveau mot de passe">
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
              style={fieldStyle}
              autoComplete="new-password"
              autoFocus
            />
          </Field>
          <Field label="Confirmation">
            <input
              required
              minLength={8}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-[13px] border outline-none"
              style={fieldStyle}
              autoComplete="new-password"
            />
          </Field>
          {(localError || error) && (
            <p className="text-[12px] px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
              {localError || error}
            </p>
          )}
        </div>
        <div className="px-5 py-4 flex justify-end gap-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button type="button" onClick={onClose} disabled={busy} className="h-10 px-4 rounded-xl text-[13px] font-semibold border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            Annuler
          </button>
          <button type="submit" disabled={busy} className="h-10 px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-primary-500)" }}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
