import { workItemEventLabel } from "../lib/work-item-events";

export type WorkItemHistoryEvent = {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
};

export function historyLabel(type: string, toValue: string | null) {
  return workItemEventLabel(type, toValue);
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
  labelForType?: (type: string, toValue: string | null) => string;
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
              <strong>{labelForType(event.type, event.toValue)}</strong>
              <time>{new Date(event.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
            </li>
          ))}
        </ol>
      ) : null}
      {!loading && !error && !events.length ? <p>표시할 작업 이력이 없습니다.</p> : null}
    </section>
  );
}
