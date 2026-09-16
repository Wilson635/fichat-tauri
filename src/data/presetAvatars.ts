export type AvatarGender = "homme" | "femme";
export type AvatarVariant = "jeune" | "age" | "style";

export type PresetAvatar = {
  id: string;
  src: string;
  gender: AvatarGender;
  variant: AvatarVariant;
};

const GROUPS: Array<{ prefix: string; gender: AvatarGender; variant: AvatarVariant }> = [
  { prefix: "homme-jeune", gender: "homme", variant: "jeune" },
  { prefix: "homme-age", gender: "homme", variant: "age" },
  { prefix: "homme-barbu", gender: "homme", variant: "style" },
  { prefix: "femme-jeune", gender: "femme", variant: "jeune" },
  { prefix: "femme-agee", gender: "femme", variant: "age" },
  { prefix: "femme-tresses", gender: "femme", variant: "style" },
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export const PRESET_AVATARS: PresetAvatar[] = GROUPS.flatMap(({ prefix, gender, variant }) =>
  Array.from({ length: 10 }, (_, i) => {
    const id = `${prefix}-${pad(i + 1)}`;
    return { id, src: `/avatars/${id}.png`, gender, variant };
  }),
);

export const PRESET_AVATAR_SRC = new Set(PRESET_AVATARS.map((a) => a.src));

export function isPresetAvatarSrc(src: string | null | undefined): boolean {
  return !!src && PRESET_AVATAR_SRC.has(src);
}

export const AVATAR_VARIANT_LABELS: Record<AvatarGender, Array<{ id: AvatarVariant; label: string }>> = {
  homme: [
    { id: "jeune", label: "Jeune" },
    { id: "age", label: "Âgé" },
    { id: "style", label: "Barbu" },
  ],
  femme: [
    { id: "jeune", label: "Jeune" },
    { id: "age", label: "Âgée" },
    { id: "style", label: "Tresses" },
  ],
};
