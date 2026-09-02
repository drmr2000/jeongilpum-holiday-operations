import type { BadgeTone } from "../ui/Badge";

export const WORK_STATUS_ORDER = [
  "received",
  "confirmed",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
] as const;

export type WorkStatus = (typeof WORK_STATUS_ORDER)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  received: "주문 접수",
  confirmed: "작업 준비",
  in_progress: "작업 중",
  ready: "작업 완료",
  completed: "수령 완료",
  cancelled: "취소",
};

export const WORK_STATUS_OPTIONS = WORK_STATUS_ORDER;

export const PIPELINE_WORK_STATUSES = WORK_STATUS_ORDER.filter(
  (status): status is Exclude<WorkStatus, "cancelled"> => status !== "cancelled",
);

export type PipelineWorkStatus = (typeof PIPELINE_WORK_STATUSES)[number];

const WORK_STATUS_TONES: Record<WorkStatus, BadgeTone> = {
  received: "neutral",
  confirmed: "neutral",
  in_progress: "info",
  ready: "success",
  completed: "neutral",
  cancelled: "danger",
};

export const WORKSHOP_ALLOWED_WORK_STATUS_TRANSITIONS: Readonly<Record<WorkStatus, readonly WorkStatus[]>> = {
  received: ["in_progress"],
  confirmed: ["in_progress"],
  in_progress: ["ready"],
  ready: [],
  completed: [],
  cancelled: [],
};

export type PaymentStatus = "unpaid" | "partial" | "paid";

export function workStatusLabel(status: WorkStatus) {
  return WORK_STATUS_LABELS[status];
}

export function workStatusTone(status: WorkStatus): BadgeTone {
  return WORK_STATUS_TONES[status];
}

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  return status === "paid" ? "success" : "neutral";
}
