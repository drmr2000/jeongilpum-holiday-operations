import type { BadgeTone } from "../ui/Badge";

export const PACKAGE_STATUS_LABELS = {
  queued: "queued",
  completed: "completed",
} as const;

export type PackageStatus = keyof typeof PACKAGE_STATUS_LABELS;

export const PACKAGE_STATUS_TONES: Record<PackageStatus, BadgeTone> = {
  queued: "neutral",
  completed: "green-strong",
};
