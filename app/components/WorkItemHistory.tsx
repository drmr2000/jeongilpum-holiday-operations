import { workItemEventLabel } from "../lib/work-item-events";

export type WorkItemHistoryEvent = {
  id: string;
  type: string;
  fromValue: string | null;
  createdAt: string;
};

export function historyLabel(type: string) {
  return workItemEventLabel(type);
}

export function formatWorkItemDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function WorkItemHistory({
  events,
  loading = false,
  error,
  className,
  labelForType = historyLabel,
}: {
  events: WorkItemHistoryEvent[];
  loading?: boolean;
  error?: string;
  className?: string;
  labelForType?: (type: string) => string;
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
              <strong>{labelForType(event.type)}</strong>
              <time>{formatWorkItemDateTime(event.createdAt)}</time>
            </li>
          ))}
        </ol>
      ) : null}
      {!loading && !error && !events.length ? <p>표시할 작업 이력이 없습니다.</p> : null}
    </section>
  );
}
