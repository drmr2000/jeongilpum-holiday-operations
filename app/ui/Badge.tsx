import { ArrowRight } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";

export type BadgeTone = "neutral" | "amber" | "slate" | "green" | "wine" | "danger";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function Badge({ children, tone = "neutral", className, onClick }: BadgeProps) {
  const classNames = ["ui-badge", `ui-badge--${tone}`, onClick ? "ui-badge--pressable" : "", className].filter(Boolean).join(" ");
  if (onClick) {
    return <button type="button" className={classNames} onClick={onClick}>{children}<span className="ui-badge__action-icon" aria-hidden="true"><ArrowRight size={14} /></span></button>;
  }
  return <span className={classNames}>{children}</span>;
}
