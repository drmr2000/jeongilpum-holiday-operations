export const WORK_ITEM_EVENT_KINDS = [
  "customer_arrived",
  "customer_arrival_changed",
  "order_created",
  "order_updated",
  "package_created",
  "package_reassigned",
  "payment_changed",
  "work_item_created",
  "work_item_deleted",
  "work_item_due_at_changed",
  "work_item_duplicated",
  "work_item_updated",
  "work_status_changed",
] as const;

export type WorkItemEventKind = (typeof WORK_ITEM_EVENT_KINDS)[number];

const WORK_ITEM_EVENT_LABELS: Record<WorkItemEventKind, string> = {
  customer_arrived: "고객 도착 기록",
  customer_arrival_changed: "고객 도착 기록 변경",
  order_created: "주문 생성",
  order_updated: "주문 정보 변경",
  package_created: "패키지 생성",
  package_reassigned: "패키지 작업 변경",
  payment_changed: "결제 정보 변경",
  work_item_created: "작업 생성",
  work_item_deleted: "작업 삭제",
  work_item_due_at_changed: "수령일시 변경",
  work_item_duplicated: "작업 복제",
  work_item_updated: "작업 정보 변경",
  work_status_changed: "작업 상태 변경",
};

function eventKindFromType(type: string) {
  const [kind] = type.split(":", 1);
  return WORK_ITEM_EVENT_KINDS.includes(kind as WorkItemEventKind)
    ? kind as WorkItemEventKind
    : null;
}

export function workItemEventType(kind: WorkItemEventKind, idempotencyKey?: string) {
  const suffix = idempotencyKey?.trim();
  return suffix ? `${kind}:${suffix}` : kind;
}

export function workItemEventLabel(type: string) {
  const kind = eventKindFromType(type);
  return kind ? WORK_ITEM_EVENT_LABELS[kind] : "작업 이력 기록";
}
