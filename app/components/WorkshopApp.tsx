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
import AppNav from "./AppNav";
import {
  Button,
  DataTable,
  DateRangeNavigator,
  Modal,
  OperationsPageHeader,
  Tabs,
  Toolbar,
  useResource,
} from "../ui";
import {
  workStatusLabel,
  type WorkStatus,
} from "../lib/work-status";
import WorkItemEditor, {
  toWorkItemChanges,
  type EditableWorkItem,
  type WorkItemDraft,
} from "./WorkItemEditor";
import WorkStatusSelect from "./WorkStatusSelect";
import "../workshop-flow.css";

type WorkItem = EditableWorkItem & {
  deliveryMethod: "onsite_reservation" | "delivery";
  address: string;
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
    exportValue: (product) => product.productName,
    rowHeader: true,
  },
  {
    id: "total",
    header: "전체",
    cell: (product) => `${product.totalQuantity.toLocaleString()}개`,
    exportValue: (product) => `${product.totalQuantity.toLocaleString()}개`,
  },
  {
    id: "completed",
    header: "완료",
    cell: (product) => `${product.completedQuantity.toLocaleString()}개`,
    exportValue: (product) => `${product.completedQuantity.toLocaleString()}개`,
  },
  {
    id: "pending",
    header: "남은 작업",
    cell: (product) => `${product.pendingQuantity.toLocaleString()}개`,
    exportValue: (product) => `${product.pendingQuantity.toLocaleString()}개`,
  },
  {
    id: "daily-limit",
    header: "일일 한도",
    cell: (product) => (
      product.dailyLimit === null
        ? "미설정"
        : `${product.dailyLimit.toLocaleString()}개${product.totalQuantity > product.dailyLimit ? " 초과" : ""}`
    ),
    exportValue: (product) => (
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

export default function WorkshopApp() {
  const [date, setDate] = useState(todayInSeoul);
  const [tab, setTab] = useState<WorkshopTab>("onsite");
  const [onsite, setOnsite] = useState<WorkItem[]>([]);
  const [delivery, setDelivery] = useState<WorkItem[]>([]);
  const [products, setProducts] = useState<ProductTotal[]>([]);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<WorkStatus>("confirmed");
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
    successMessage = `${workStatusLabel(status)} 상태로 변경했습니다.`,
  ) => {
    const targets = items.filter((item) => item.workStatus !== status && !busyIds.includes(item.id));
    if (!targets.length) {
      setNotice("변경할 작업이 없습니다.");
      return;
    }

    setBusyIds((current) => [...new Set([...current, ...targets.map((item) => item.id)])]);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/work-items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          workStatus: status,
          items: targets.map((item) => ({
            id: item.id,
            expectedVersion: item.version,
          })),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string };
      if (!response.ok) throw new Error(data?.error || "작업 상태를 변경하지 못했습니다.");
      await reload({ silent: true });
      setSelectedIds((current) => current.filter((id) => !targets.some((item) => item.id === id)));
      setNotice(targets.length === 1 ? successMessage : `${targets.length}개 작업 상태를 ${workStatusLabel(status)}으로 변경했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "작업 상태를 변경하지 못했습니다.");
    } finally {
      setBusyIds((current) => current.filter((id) => !targets.some((item) => item.id === id)));
    }
  };

  const saveWorkItem = async (item: EditableWorkItem, draft: WorkItemDraft) => {
    const response = await fetch("/api/work-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        expectedVersion: item.version,
        changes: toWorkItemChanges(draft),
      }),
    });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(data?.error ?? "작업 행을 저장하지 못했습니다.");
    setSelected(null);
    setNotice("작업 행을 저장했습니다.");
    await reload({ silent: true });
  };

  const deleteWorkItem = async (item: WorkItem) => {
    try {
      const response = await fetch("/api/work-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, expectedVersion: item.version }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "작업 행을 삭제하지 못했습니다.");
      setSelected(null);
      setNotice("작업 행을 삭제했습니다.");
      await reload({ silent: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "작업 행을 삭제하지 못했습니다.");
    }
  };

  const duplicateWorkItem = async (item: WorkItem) => {
    try {
      const response = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: item.id, expectedVersion: item.version }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "작업 행을 복제하지 못했습니다.");
      setSelected(null);
      setNotice("작업 행을 복제했습니다.");
      await reload({ silent: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "작업 행을 복제하지 못했습니다.");
    }
  };

  const statusColumn: DataTableColumn<WorkItem> = {
    id: "status",
    header: "작업 상태",
    cell: (item) => {
      const isBusy = busyIds.includes(item.id);
      return (
        <WorkStatusSelect
          id={`workshop-work-status-${item.id}`}
          label={<span className="sr-only">작업 상태</span>}
          value={item.workStatus}
          disabled={isBusy}
          onClick={(event) => event.stopPropagation()}
          onChange={(status) => void updateWorkStatuses([item], status)}
        />
      );
    },
    sortValue: (item) => item.workStatus,
    exportValue: (item) => workStatusLabel(item.workStatus),
    width: "164px",
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
  ];

  const tabItems = [
    { id: "onsite", label: "현장", count: onsite.length },
    { id: "delivery", label: "택배", count: delivery.length },
  ];

  const activeRows = tab === "onsite" ? onsite : delivery;
  const activeColumns = tab === "onsite" ? onsiteColumns : deliveryColumns;
  const selectedWorkItems = activeRows.filter((item) => selectedIds.includes(item.id));
  const selectedBusy = selectedWorkItems.some((item) => busyIds.includes(item.id));

  const runBulkAction = async () => {
    await updateWorkStatuses(selectedWorkItems, bulkStatus);
    setBulkActionModalOpen(false);
  };

  return (
    <div className="workshop-app">
      <OperationsPageHeader title="정일품 작업장" description="작업 관리" href="/workshop" />
      <AppNav current="workshop" />

      <main className="workshop-main">
        <section className="workshop-date-toolbar" aria-label="작업 기준일 선택">
          <Toolbar
            filters={
              <DateRangeNavigator
                ariaLabel="작업 기준일"
                dateFrom={date}
                dateFromId="workshop-date"
                dateFromLabel={<span className="sr-only">작업일</span>}
                onChange={(dateFrom) => {
                  setDate(dateFrom);
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
              exportName="작업장-상품별-작업량"
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
            exportName={tab === "onsite" ? "작업장-현장-작업" : "작업장-택배-작업"}
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

      {selected ? (
        <WorkItemEditor
          key={`${selected.id}-${selected.version}`}
          item={selected}
          description={`${selected.orderNo} · ${selected.buyerName} · ${selected.buyerPhone}`}
          onClose={() => setSelected(null)}
          onSave={saveWorkItem}
          onDelete={() => void deleteWorkItem(selected)}
          onDuplicate={() => void duplicateWorkItem(selected)}
        />
      ) : null}

      <Modal
        open={bulkActionModalOpen}
        title="선택 작업 처리"
        description={selectedWorkItems.length ? `${selectedWorkItems.length}개 작업을 선택했습니다.` : "선택한 작업이 없습니다."}
        onClose={() => setBulkActionModalOpen(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setBulkActionModalOpen(false)}>닫기</Button>
            <Button disabled={selectedBusy} onClick={() => void runBulkAction()}>
              {selectedBusy ? "처리 중" : "상태 변경"}
            </Button>
          </>
        )}
      >
        <section className="workshop-action-summary">
          <WorkStatusSelect
            id="workshop-bulk-status"
            label="변경할 작업 상태"
            value={bulkStatus}
            onChange={setBulkStatus}
          />
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
