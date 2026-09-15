import { APP_NAME } from "@/brand";

export function AppLogo({
  size = 40,
  className,
  title = APP_NAME,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={title}
      className={className}
      draggable={false}
      style={{
        flexShrink: 0,
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
      }}
    />
  );
}
