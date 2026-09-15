import type { ReactNode } from "react";
import { APP_NAME } from "@/brand";
import { AppLogo } from "@/components/AppLogo";
import { Icon, type IconName } from "@/components/Icon";

export function AuthShell({
  kicker = "First Trust",
  headline,
  description,
  features,
  aside,
  footer,
  wide,
  children,
}: {
  kicker?: string;
  headline: string;
  description: string;
  features?: string[];
  aside?: ReactNode;
  footer?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="flex items-center gap-3 mb-10">
          <AppLogo size={44} />
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white">{APP_NAME}</p>
            <p className="text-[11px] font-medium" style={{ color: "rgba(232,237,244,0.62)" }}>
              {kicker}
            </p>
          </div>
        </div>

        <h1 className="text-[26px] font-semibold tracking-tight leading-snug text-white">
          {headline}
        </h1>
        <p className="text-[13.5px] leading-relaxed mt-3" style={{ color: "rgba(232,237,244,0.72)" }}>
          {description}
        </p>

        {features && features.length > 0 && (
          <ul className="mt-7 space-y-2.5">
            {features.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: "rgba(232,237,244,0.88)" }}>
                <Icon name="checkBadge" size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary-400)" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {aside && <div className="mt-8">{aside}</div>}

        <div className="mt-auto pt-10">
          {aside ? null : (
            <div className="space-y-2 mb-8">
              <div className="auth-bubble in">Réunion à 14 h, salle B ?</div>
              <div className="auth-bubble out">Confirmé — je prépare le dossier.</div>
            </div>
          )}
          <p className="text-[11px] font-medium" style={{ color: "rgba(232,237,244,0.48)" }}>
            {footer ?? "Application de bureau Windows · LDAP / Active Directory"}
          </p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-brand-compact">
          <AppLogo size={40} />
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{APP_NAME}</p>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{kicker}</p>
          </div>
        </div>
        <div className={`auth-card animate-fade-in ${wide ? "is-wide" : ""}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  htmlFor,
  icon,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  icon?: IconName;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-semibold mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>
      <div className="auth-field">
        {icon && <Icon name={icon} size={16} className="shrink-0" style={{ color: "var(--color-text-muted)" }} />}
        {children}
      </div>
      {hint && (
        <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl p-3 text-[13px] flex items-start gap-2"
      style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#dc2626" }}
      role="alert"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
  onClick,
  type = "submit",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full h-11 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-55"
      style={{ backgroundColor: "var(--color-primary-500)" }}
    >
      {children}
    </button>
  );
}

export function AuthToggle({
  on,
  onChange,
  label,
  description,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
      style={{ backgroundColor: "var(--color-surface-secondary)" }}
    >
      <div
        className="relative w-11 h-6 rounded-full transition-colors shrink-0"
        style={{ backgroundColor: on ? "var(--color-primary-500)" : "var(--color-border-strong)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
          style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }}
        />
      </div>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </span>
        {description && (
          <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
