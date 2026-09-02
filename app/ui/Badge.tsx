import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "danger";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return <span className={["ui-badge", `ui-badge--${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
