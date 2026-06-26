import type { ReactNode } from "react";

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "success" | "danger" | "warning" | "avrg";
}) {
  return (
    <span className={`badge${tone ? ` badge--${tone}` : ""}`}>{children}</span>
  );
}
