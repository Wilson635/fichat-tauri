import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  AVATAR_VARIANT_LABELS,
  PRESET_AVATARS,
  type AvatarGender,
  type AvatarVariant,
} from "@/data/presetAvatars";

function initialFromSrc(src: string | null): { gender: AvatarGender; variant: AvatarVariant } {
  const found = PRESET_AVATARS.find((a) => a.src === src);
  return { gender: found?.gender ?? "homme", variant: found?.variant ?? "jeune" };
}

export function ProfileAvatarGallery({
  selectedSrc,
  busy,
  onSelect,
  onUploadClick,
  compact = false,
}: {
  selectedSrc: string | null;
  busy: boolean;
  onSelect: (src: string) => void;
  onUploadClick: () => void;
  compact?: boolean;
}) {
  const start = initialFromSrc(selectedSrc);
  const [gender, setGender] = useState<AvatarGender>(start.gender);
  const [variant, setVariant] = useState<AvatarVariant>(start.variant);

  const variants = AVATAR_VARIANT_LABELS[gender];
  const avatars = useMemo(
    () => PRESET_AVATARS.filter((a) => a.gender === gender && a.variant === variant),
    [gender, variant],
  );

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {!compact && (
        <div className="px-4 py-3 border-b flex items-start justify-between gap-3" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Photo de profil
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Choisissez un avatar, ou téléversez votre image
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onUploadClick}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary-500)" }}
          >
            <Icon name="image" size={14} />
            Téléverser une image
          </button>
        </div>
      )}

      <div className="px-4 pt-3 flex gap-1.5">
        {(["homme", "femme"] as const).map((g) => {
          const on = gender === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{
                backgroundColor: on ? "var(--color-active)" : "var(--color-surface-secondary)",
                color: on ? "var(--color-primary-700)" : "var(--color-text-secondary)",
              }}
            >
              {g === "homme" ? "Hommes" : "Femmes"}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
        {variants.map((v) => {
          const on = variant === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v.id)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{
                backgroundColor: on ? "var(--color-active)" : "transparent",
                color: on ? "var(--color-primary-700)" : "var(--color-text-secondary)",
                border: on ? "1px solid transparent" : "1px solid var(--color-border)",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className={`${compact ? "p-3 grid-cols-4 gap-2" : "p-4 grid-cols-5 gap-2.5"} grid`}>
        {avatars.map((a) => {
          const selected = selectedSrc === a.src;
          return (
            <button
              key={a.id}
              type="button"
              disabled={busy}
              title="Choisir cet avatar"
              onClick={() => onSelect(a.src)}
              className="aspect-square rounded-2xl overflow-hidden border-2 disabled:opacity-50"
              style={{
                borderColor: selected ? "var(--color-primary-500)" : "var(--color-border)",
                boxShadow: selected ? "0 0 0 2px var(--color-active)" : undefined,
              }}
            >
              <img src={a.src} alt="" className="w-full h-full object-cover" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
