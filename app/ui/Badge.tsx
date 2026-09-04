import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "amber" | "wine" | "green" | "green-strong" | "danger";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  const classNames = ["ui-badge", `ui-badge--${tone}`, className].filter(Boolean).join(" ");
  return <span className={classNames}>{children}</span>;
}
