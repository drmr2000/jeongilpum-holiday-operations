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
  confirmed: "amber",
  in_progress: "wine",
  ready: "green",
  completed: "green-strong",
  cancelled: "danger",
};

export type PaymentStatus = "unpaid" | "partial" | "paid";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "주문",
  partial: "부분결제",
  paid: "결제완료",
};

const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  unpaid: "neutral",
  partial: "amber",
  paid: "green",
};

export function prepareWorkStatusTransition(
  database: D1Database,
  {
    nextStatus,
    now,
    whereSql,
    whereBindings,
  }: {
    nextStatus: WorkStatus;
    now: string;
    whereSql: string;
    whereBindings: unknown[];
  },
) {
  return database.prepare(`
    UPDATE work_items
    SET work_status=?,version=version+1,updated_at=?
    WHERE ${whereSql}
  `).bind(nextStatus, now, ...whereBindings);
}

export function workStatusLabel(status: WorkStatus) {
  return WORK_STATUS_LABELS[status];
}

export function workStatusTone(status: WorkStatus): BadgeTone {
  return WORK_STATUS_TONES[status];
}

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  return PAYMENT_STATUS_TONES[status];
}
