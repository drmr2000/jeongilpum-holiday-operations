"use client";

import {
  ClipboardList,
  Factory,
  Package,
  Route,
  ScanLine,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { DataTableColumn } from "../ui";
import {
  Badge,
  Button,
  DataTable,
  FieldInput,
  Modal,
  Tabs,
  Toolbar,
  useResource,
} from "../ui";
import {
  WORK_STATUS_ALLOWED_TRANSITIONS,
  workStatusLabel,
  workStatusTone,
  type WorkStatus,
} from "../lib/work-status";
import OpsHeader from "./OpsHeader";
import WorkItemHistory, { historyLabel as sharedHistoryLabel } from "./WorkItemHistory";
import "../workshop-flow.css";

type WorkItem = {
  id: string;
  orderId: string;
  orderNo: string;
  productId: string;
  productName: string;
  quantity: number;
  deliveryMethod: "onsite_reservation" | "delivery";
  dueAt: string;
  workStatus: WorkStatus;
  note: string;
  address: string;
  version: number;
  events: Array<{
    id: string;
    type: string;
    fromValue: string | null;
    toValue: string | null;
    createdAt: string;
  }>;
};

type ProductTotal = {
  productId: string;
  productName: string;
  totalQuantity: number;
  completedQuantity: number;
  pendingQuantity: number;
  dailyLimit: number | null;
};

type WorkshopResponse = {
  onsite?: WorkItem[];
  delivery?: WorkItem[];
  products?: ProductTotal[];
};

type WorkshopTab = "onsite" | "delivery";

const productTotalColumns: DataTableColumn<ProductTotal>[] = [
  {
    id: "product",
    header: "상품",
    cell: (product) => product.productName,
    rowHeader: true,
  },
  {
    id: "total",
    header: "전체",
    cell: (product) => `${product.totalQuantity.toLocaleString()}개`,
  },
  {
    id: "completed",
    header: "완료",
    cell: (product) => `${product.completedQuantity.toLocaleString()}개`,
  },
  {
    id: "pending",
    header: "남은 작업",
    cell: (product) => `${product.pendingQuantity.toLocaleString()}개`,
  },
  {
    id: "daily-limit",
    header: "일일 한도",
    cell: (product) => (
      product.dailyLimit === null
        ? "미설정"
        : `${product.dailyLimit.toLocaleString()}개${product.totalQuantity > product.dailyLimit ? " 초과" : ""}`
    ),
  },
];

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatTime(value: string) {
  return value.slice(11, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00+09:00`));
}

function historyLabel(type: string, toValue: string | null) {
  return sharedHistoryLabel(type, toValue);
}

function workshopAction(status: WorkStatus) {
  const nextStatus = WORK_STATUS_ALLOWED_TRANSITIONS[status].find(
    (candidate) => candidate === "in_progress" || candidate === "ready",
  );
  if (nextStatus === "in_progress") return { status: nextStatus, label: "작업 시작", notice: "작업을 시작했습니다." };
  if (nextStatus === "ready") return { status: nextStatus, label: "작업 완료", notice: "작업을 완료했습니다." };
  return null;
}

function workItemGroups(items: WorkItem[], orderByTime: boolean) {
  const byProduct = new Map<string, WorkItem[]>();
  for (const item of items) {
    const rows = byProduct.get(item.productName) ?? [];
    rows.push(item);
    byProduct.set(item.productName, rows);
  }

  const grouped = [...byProduct.entries()].map(([productName, rows]) => {
    const sortedRows = [...rows].sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id));
    return { productName, rows: sortedRows };
  });

  grouped.sort((left, right) => {
    if (orderByTime) {
      return (left.rows[0]?.dueAt ?? "").localeCompare(right.rows[0]?.dueAt ?? "");
    }
    return left.productName.localeCompare(right.productName, "ko-KR", { numeric: true });
  });

  return grouped.map(({ productName, rows }) => ({
    id: productName,
    header: `${productName} · ${rows.reduce((total, item) => total + item.quantity, 0).toLocaleString()}개 · ${rows.length}건`,
    rows,
  }));
}

async function settleInBatches<T>(
  values: T[],
  operation: (value: T) => Promise<void>,
  batchSize = 4,
) {
  const results: PromiseSettledResult<void>[] = [];
  for (let start = 0; start < values.length; start += batchSize) {
    results.push(...await Promise.allSettled(values.slice(start, start + batchSize).map(operation)));
  }
  return results;
}

export default function WorkshopApp() {
  const [date, setDate] = useState(todayInSeoul);
  const [tab, setTab] = useState<WorkshopTab>("onsite");
  const [onsite, setOnsite] = useState<WorkItem[]>([]);
  const [delivery, setDelivery] = useState<WorkItem[]>([]);
  const [products, setProducts] = useState<ProductTotal[]>([]);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { reload } = useResource<WorkshopResponse>(
    `/api/workshop/orders?date=${encodeURIComponent(date)}`,
    2500,
    {
      onData: (data) => {
        const nextOnsite = data.onsite ?? [];
        const nextDelivery = data.delivery ?? [];
        const nextItems = [...nextOnsite, ...nextDelivery];
        setOnsite(nextOnsite);
        setDelivery(nextDelivery);
        setProducts(data.products ?? []);
        setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
        setSelected((current) => {
          if (!current) return null;
          return nextItems.find((item) => item.id === current.id) ?? null;
        });
        setError("");
      },
      onError: (resourceError) => setError(resourceError.message || "작업 목록을 불러오지 못했습니다."),
    },
  );

  const openDetail = (item: WorkItem) => {
    setSelected(item);
  };

  const updateWorkStatuses = async (
    items: WorkItem[],
    status: WorkStatus,
    successMessage: string,
  ) => {
    const targets = items.filter((item) => item.workStatus !== status && !busyIds.includes(item.id));
    if (!targets.length) {
      setNotice("변경할 작업이 없습니다.");
      return;
    }

    setBusyIds((current) => [...new Set([...current, ...targets.map((item) => item.id)])]);
    setError("");
    setNotice("");

    const results = await settleInBatches(targets, async (item) => {
      const response = await fetch("/api/workshop/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workItemId: item.id,
          status,
          expectedVersion: item.version,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string };
      if (!response.ok) throw new Error(data?.error || "작업 상태를 변경하지 못했습니다.");
    });

    const completedIds = targets.filter((_, index) => results[index]?.status === "fulfilled").map((item) => item.id);
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    try {
      await reload({ silent: true });
    } finally {
      setBusyIds((current) => current.filter((id) => !targets.some((item) => item.id === id)));
    }

    if (completedIds.length) {
      setSelectedIds((current) => current.filter((id) => !completedIds.includes(id)));
      setNotice(completedIds.length === 1 ? successMessage : `${completedIds.length}개 작업 상태를 ${workStatusLabel(status)}으로 변경했습니다.`);
    }
    if (failed.length) {
      const firstFailure = failed[0]?.reason;
      const message = firstFailure instanceof Error ? firstFailure.message : "작업 상태를 변경하지 못했습니다.";
      setError(`${failed.length}개 작업 상태를 변경하지 못했습니다. ${message}`);
    }
  };

  const statusColumn: DataTableColumn<WorkItem> = {
    id: "status",
    header: "작업 상태",
    cell: (item) => <Badge tone={workStatusTone(item.workStatus)}>{workStatusLabel(item.workStatus)}</Badge>,
    sortValue: (item) => item.workStatus,
    width: "132px",
  };

  const actionColumn: DataTableColumn<WorkItem> = {
    id: "action",
    header: "처리",
    cell: (item) => {
      const action = workshopAction(item.workStatus);
      if (!action) return <span aria-label="작업장 처리 없음">-</span>;
      const isBusy = busyIds.includes(item.id);
      return (
        <Button
          size="sm"
          disabled={isBusy}
          onClick={(event) => {
            event.stopPropagation();
            void updateWorkStatuses([item], action.status, action.notice);
          }}
        >
          {isBusy ? "처리 중" : action.label}
        </Button>
      );
    },
    width: "132px",
  };

  const onsiteColumns: DataTableColumn<WorkItem>[] = [
    {
      id: "time",
      header: "예약 시각",
      cell: (item) => <strong>{formatTime(item.dueAt)}</strong>,
      sortValue: (item) => item.dueAt,
      width: "112px",
    },
    {
      id: "product",
      header: "상품",
      cell: (item) => <span>{item.productName}</span>,
      sortValue: (item) => item.productName,
    },
    {
      id: "quantity",
      header: "수량",
      cell: (item) => <strong>{item.quantity.toLocaleString()}개</strong>,
      sortValue: (item) => item.quantity,
      align: "right",
      width: "96px",
    },
    statusColumn,
    actionColumn,
  ];

  const deliveryColumns: DataTableColumn<WorkItem>[] = [
    {
      id: "product",
      header: "상품",
      cell: (item) => <span>{item.productName}</span>,
      sortValue: (item) => item.productName,
    },
    {
      id: "quantity",
      header: "수량",
      cell: (item) => <strong>{item.quantity.toLocaleString()}개</strong>,
      sortValue: (item) => item.quantity,
      align: "right",
      width: "96px",
    },
    {
      id: "address",
      header: "배송지",
      cell: (item) => item.address || "주소 미입력",
      sortValue: (item) => item.address,
    },
    statusColumn,
    actionColumn,
  ];

  const tabItems = [
    { id: "onsite", label: "현장", count: onsite.length },
    { id: "delivery", label: "택배", count: delivery.length },
  ];

  const activeRows = tab === "onsite" ? onsite : delivery;
  const activeColumns = tab === "onsite" ? onsiteColumns : deliveryColumns;
  const selectedWorkItems = activeRows.filter((item) => selectedIds.includes(item.id));
  const selectedBusy = selectedWorkItems.some((item) => busyIds.includes(item.id));
  const selectedForStatus = (status: WorkStatus) => selectedWorkItems.filter(
    (item) => workshopAction(item.workStatus)?.status === status,
  );
  const startingItems = selectedForStatus("in_progress");
  const completingItems = selectedForStatus("ready");
  const selectedAction = selected ? workshopAction(selected.workStatus) : null;

  const runBulkAction = async (items: WorkItem[], status: WorkStatus, successMessage: string) => {
    await updateWorkStatuses(items, status, successMessage);
    setBulkActionModalOpen(false);
  };

  return (
    <div className="workshop-app">
      <OpsHeader surface="workshop" title="정일품 작업장" subtitle={formatDate(date)} />

      <main className="workshop-main">
        <section className="workshop-date-toolbar" aria-label="작업 기준일 선택">
          <Toolbar
            filters={
              <FieldInput
                id="workshop-date"
                className="workshop-date-field"
                label={<span className="sr-only">작업일</span>}
                aria-label="작업일"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedIds([]);
                  setBulkActionModalOpen(false);
                }}
              />
            }
            selectionCount={selectedWorkItems.length || undefined}
            actions={selectedWorkItems.length ? (
              <Button
                leadingIcon={<ClipboardList size={16} />}
                onClick={() => setBulkActionModalOpen(true)}
              >
                선택 작업 처리
              </Button>
            ) : null}
          />
        </section>

        {error ? <section className="workshop-message workshop-message--error" role="alert">{error}</section> : null}
        {notice ? <section className="workshop-message" role="status">{notice}</section> : null}

        <section className="workshop-product-summary" aria-label="상품별 작업량">
          {products.length ? (
            <DataTable
              ariaLabel="상품별 작업 수량"
              rows={products}
              columns={productTotalColumns}
              getRowId={(product) => product.productId}
            />
          ) : <p className="workshop-empty">집계할 상품 작업이 없습니다.</p>}
        </section>

        <div className="workshop-tab-bar">
          <Tabs
            ariaLabel="작업장 보기"
            items={tabItems}
            value={tab}
            onValueChange={(value) => {
              setTab(value as WorkshopTab);
              setSelectedIds([]);
              setBulkActionModalOpen(false);
            }}
          />
        </div>

        <section className="workshop-work-list">
          <DataTable
            key={tab}
            ariaLabel={tab === "onsite" ? "현장 작업" : "택배 작업"}
            rows={activeRows}
            columns={activeColumns}
            getRowId={(item) => item.id}
            onRowClick={openDetail}
            groups={workItemGroups(activeRows, tab === "onsite")}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            emptyMessage={tab === "onsite" ? "현장 작업이 없습니다." : "택배 작업이 없습니다."}
          />
        </section>

        <nav className="workshop-utility-links" aria-label="작업장 부가 기능">
          <UtilityLink href="/workshop/production" icon={<Factory size={18} />} label="생산관리" />
          <UtilityLink href="/workshop/production#skin-packs" icon={<Package size={18} />} label="스킨팩" />
          <UtilityLink href="/workshop/production#traceability" icon={<ScanLine size={18} />} label="이력추적" />
          <UtilityLink href="/workshop/packages" icon={<Route size={18} />} label="패키지" />
        </nav>
      </main>

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.productName} · ${selected.quantity.toLocaleString()}개` : ""}
        description={selected ? `${selected.orderNo} · ${selected.deliveryMethod === "delivery" ? "택배" : `${formatTime(selected.dueAt)} 현장 예약`}` : ""}
        onClose={() => setSelected(null)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>닫기</Button>
            {selectedAction ? (
              <Button
                disabled={busyIds.includes(selected?.id ?? "") || !selected}
                onClick={() => {
                  if (selected) void updateWorkStatuses([selected], selectedAction.status, selectedAction.notice);
                }}
                leadingIcon={<ClipboardList size={16} />}
              >
                {busyIds.includes(selected?.id ?? "") ? "처리 중" : selectedAction.label}
              </Button>
            ) : null}
          </>
        )}
      >
        {selected ? (
          <div className="workshop-detail-content">
            <div className="workshop-detail-grid">
              <p><span>수령방법</span><strong>{selected.deliveryMethod === "delivery" ? "택배" : "현장 예약"}</strong></p>
              <p><span>작업 시각</span><strong>{selected.deliveryMethod === "delivery" ? selected.dueAt.slice(0, 10) : `${selected.dueAt.slice(0, 10)} ${formatTime(selected.dueAt)}`}</strong></p>
              {selected.deliveryMethod === "delivery" ? <p><span>배송지</span><strong>{selected.address || "주소 미입력"}</strong></p> : null}
            </div>
            <section className="workshop-action-summary">
              <h3>작업 처리</h3>
              <p>{selectedAction ? `${selectedAction.label}을 실행할 수 있습니다.` : "작업장에서 실행할 수 있는 작업이 없습니다."}</p>
            </section>
            {selected.note ? <section className="workshop-detail-note"><h3>작업 요청사항</h3><p>{selected.note}</p></section> : null}
            <WorkItemHistory
              className="workshop-detail-history"
              events={selected.events}
              labelForType={historyLabel}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={bulkActionModalOpen}
        title="선택 작업 처리"
        description={selectedWorkItems.length ? `${selectedWorkItems.length}개 작업을 선택했습니다.` : "선택한 작업이 없습니다."}
        onClose={() => setBulkActionModalOpen(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setBulkActionModalOpen(false)}>닫기</Button>
            {startingItems.length ? (
              <Button
                disabled={selectedBusy}
                onClick={() => void runBulkAction(startingItems, "in_progress", "작업을 시작했습니다.")}
              >
                {selectedBusy ? "처리 중" : `작업 시작 ${startingItems.length}건`}
              </Button>
            ) : null}
            {completingItems.length ? (
              <Button
                disabled={selectedBusy}
                onClick={() => void runBulkAction(completingItems, "ready", "작업을 완료했습니다.")}
              >
                {selectedBusy ? "처리 중" : `작업 완료 ${completingItems.length}건`}
              </Button>
            ) : null}
          </>
        )}
      >
        <section className="workshop-action-summary">
          <h3>변경 대상</h3>
          <p>작업 시작 {startingItems.length}건 · 작업 완료 {completingItems.length}건</p>
        </section>
      </Modal>
    </div>
  );
}

function UtilityLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a href={href}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </a>
  );
}
