import { workItemEventLabel } from "../lib/work-item-events";
import { workStatusLabel, type WorkStatus } from "../lib/work-status";

export type WorkItemHistoryEvent = {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
};

export function historyLabel(type: string) {
  return workItemEventLabel(type);
}

export function formatWorkItemDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function statusFromEventValue(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { workStatus?: unknown };
    return typeof parsed.workStatus === "string" ? parsed.workStatus as WorkStatus : null;
  } catch {
    return null;
  }
}

function historyDescription(event: WorkItemHistoryEvent) {
  if (!event.type.startsWith("work_status_changed:")) return historyLabel(event.type);
  const fromStatus = statusFromEventValue(event.fromValue);
  const toStatus = statusFromEventValue(event.toValue);
  if (!fromStatus || !toStatus) return historyLabel(event.type);
  return `${historyLabel(event.type)}: ${workStatusLabel(fromStatus)} → ${workStatusLabel(toStatus)}`;
}

export default function WorkItemHistory({
  events,
  loading = false,
  error,
  className,
}: {
  events: WorkItemHistoryEvent[];
  loading?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3>작업 이력</h3>
      {loading ? <p>작업 이력을 불러오는 중입니다.</p> : null}
      {!loading && error ? <p role="alert">{error}</p> : null}
      {!loading && !error && events.length ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{historyDescription(event)}</strong>
              <time>{formatWorkItemDateTime(event.createdAt)}</time>
            </li>
          ))}
        </ol>
      ) : null}
      {!loading && !error && !events.length ? <p>표시할 작업 이력이 없습니다.</p> : null}
    </section>
  );
}
