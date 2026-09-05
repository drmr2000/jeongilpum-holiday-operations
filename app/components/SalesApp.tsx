"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import AppNav from "./AppNav";
import {
  Badge,
  Button,
  DataTable,
  DateRangeNavigator,
  FieldInput,
  FieldSelect,
  Modal,
  OperationsPageHeader,
  Tabs,
  Toolbar,
  useResource,
  type DataTableColumn,
} from "../ui";
import {
  PIPELINE_WORK_STATUSES,
  PAYMENT_STATUS_LABELS,
  WORK_STATUS_LABELS,
  WORK_STATUS_OPTIONS,
  paymentRequiresCollection,
  paymentStatusTone,
  workStatusLabel,
  workStatusTone,
  type PaymentStatus,
  type PipelineWorkStatus,
  type WorkStatus,
} from "../lib/work-status";
import { formatWorkItemDateTime } from "./WorkItemHistory";
import SharedWorkItemEditor, {
  WorkItemFields as SharedWorkItemFields,
  toWorkItemChanges,
  type WorkItemDraft,
} from "./WorkItemEditor";
import WorkStatusSelect from "./WorkStatusSelect";
import "../sales/work-table.css";

type DeliveryMethod = "onsite_sale" | "onsite_reservation" | "delivery";
type Tab = "work" | "customers";

type WorkItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  deliveryMethod: DeliveryMethod;
  dueAt: string;
  workStatus: WorkStatus;
  recipientName: string | null;
  recipientPhone: string | null;
  postalCode: string | null;
  roadAddr: string | null;
  roadAddrReference: string | null;
  jibunAddr: string | null;
  detailAddr: string | null;
  customizationJson: string | null;
  note: string;
  version: number;
  orderNo: string;
  buyerName: string;
  buyerPhone: string;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  totalAmount: number;
  customerArrivedAt: string | null;
  orderVersion: number;
  productDailyLimit: number | null;
  productScheduledQuantity: number;
};

type Dashboard = Record<PipelineWorkStatus, Record<DeliveryMethod, number>>;

type WorkResponse = {
  workItems: WorkItem[];
  dashboard: Dashboard;
};

type CustomerOrder = {
  id: string;
  orderNo: string;
  createdAt: string;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  totalAmount: number;
  balance: number;
  version: number;
  workItems: WorkItem[];
};

type CustomerOrderRow = CustomerOrder & {
  buyerName: string;
  buyerPhone: string;
};

type Customer = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  balance: number;
  orders: CustomerOrder[];
};

type CustomerResponse = {
  customers: Customer[];
};

type Selection = {
  id: string;
  expectedVersion: number;
};

type WorkDraft = WorkItemDraft;

type OrderDraft = {
  orderNo: string;
  buyerName: string;
  buyerPhone: string;
};

type NewOrderWorkItem = {
  id: string;
  draft: WorkDraft;
};

type OrderSelection = {
  order: CustomerOrder;
  buyerName: string;
  buyerPhone: string;
};

type DuplicateRequest =
  | { kind: "item"; item: WorkItem }
  | { kind: "selection"; count: number };

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  onsite_sale: "현장판매",
  onsite_reservation: "현장예약",
  delivery: "택배예약",
};

const DELIVERY_TONES: Record<DeliveryMethod, import("../ui").BadgeTone> = {
  onsite_sale: "neutral",
  onsite_reservation: "amber",
  delivery: "wine",
};

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function workUrl({
  view,
  dateFrom,
  dateTo,
  query,
}: {
  view: Tab;
  dateFrom: string;
  dateTo: string;
  query: string;
}) {
  const params = new URLSearchParams();
  if (view === "customers") params.set("view", "customers");
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (query.trim()) params.set("q", query.trim());
  return `/api/work-items?${params.toString()}`;
}

function toDueAt(value: string) {
  return `${value}:00+09:00`;
}

function nullable(value: string) {
  return value.trim() || null;
}

function emptyWorkDraft(): WorkDraft {
  return {
    productId: "",
    unitPrice: "",
    quantity: "1",
    deliveryMethod: "onsite_reservation",
    dueAt: `${todayInSeoul()}T10:00`,
    recipientName: "",
    recipientPhone: "",
    postalCode: "",
    roadAddr: "",
    roadAddrReference: "",
    jibunAddr: "",
    detailAddr: "",
    customizationJson: "",
    workStatus: "received",
    note: "",
  };
}

function workDraftError(draft: WorkDraft) {
  if (!draft.productId) return "상품을 선택해주세요.";
  if (!Number.isInteger(Number(draft.quantity)) || Number(draft.quantity) < 1) {
    return "수량은 1 이상의 정수여야 합니다.";
  }
  if (!Number.isInteger(Number(draft.unitPrice)) || Number(draft.unitPrice) < 0) {
    return "상품 단가는 0 이상의 정수여야 합니다.";
  }
  if (!draft.dueAt) return "수령일시를 입력해주세요.";
  return "";
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function urgentWorkItem(item: WorkItem) {
  if (item.workStatus === "completed" || item.workStatus === "cancelled") return false;
  if (item.customerArrivedAt) return true;
  const dueAt = Date.parse(item.dueAt);
  return Number.isFinite(dueAt) && dueAt <= Date.now() + 30 * 60_000;
}

function workItemUrgencyClass(item: WorkItem) {
  if (!urgentWorkItem(item)) return undefined;
  return item.customerArrivedAt || Date.parse(item.dueAt) <= Date.now()
    ? "sales-work-table__row--urgent"
    : "sales-work-table__row--soon";
}

function outstandingPaymentRowClass(item: { paymentStatus: PaymentStatus }) {
  return paymentRequiresCollection(item.paymentStatus) ? "sales-work-table__row--payment-due" : undefined;
}

function workItemRowClass(item: WorkItem) {
  return [workItemUrgencyClass(item), outstandingPaymentRowClass(item)].filter(Boolean).join(" ") || undefined;
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? "요청을 처리하지 못했습니다.");
  return data;
}

export default function SalesApp() {
  const today = todayInSeoul();
  const [tab, setTab] = useState<Tab>("work");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [workStatus, setWorkStatus] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [workDateFrom, setWorkDateFrom] = useState(today);
  const [workDateTo, setWorkDateTo] = useState(today);
  const [customerDateFrom, setCustomerDateFrom] = useState("");
  const [customerDateTo, setCustomerDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [newWorkOrder, setNewWorkOrder] = useState<CustomerOrder | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<CustomerOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderSelection | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<Selection[] | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderSelection | null>(null);
  const [duplicateRequest, setDuplicateRequest] = useState<DuplicateRequest | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const currentDateFrom = tab === "work" ? workDateFrom : customerDateFrom;
  const currentDateTo = tab === "work" ? workDateTo : customerDateTo;
  const workResourceUrl = workUrl({
    view: "work",
    dateFrom: workDateFrom,
    dateTo: workDateTo,
    query: debouncedQuery,
  });
  const customerResourceUrl = tab === "customers"
    ? workUrl({
      view: "customers",
      dateFrom: customerDateFrom,
      dateTo: customerDateTo,
      query: debouncedQuery,
    })
    : null;
  const {
    data: workData,
    error: workError,
    reload: reloadWork,
  } = useResource<WorkResponse>(workResourceUrl, 3000);
  const {
    data: customerData,
    error: customerError,
    reload: reloadCustomers,
  } = useResource<CustomerResponse>(customerResourceUrl, 3000);

  const workItems = workData?.workItems ?? [];
  const matchesWorkFilters = (item: WorkItem) => (
    (!workStatus || item.workStatus === workStatus)
    && (!deliveryMethod || item.deliveryMethod === deliveryMethod)
  );
  const filteredWorkItems = workItems.filter((item) => (
    matchesWorkFilters(item)
    && (!outstandingOnly || paymentRequiresCollection(item.paymentStatus))
  ));
  const customerOrders = (customerData?.customers ?? []).flatMap((customer) => (
    customer.orders.map((order): CustomerOrderRow => ({
      ...order,
      buyerName: customer.buyerName,
      buyerPhone: customer.buyerPhone,
    }))
  )).filter((order) => (
    (!outstandingOnly || paymentRequiresCollection(order.paymentStatus))
    && (!workStatus && !deliveryMethod || order.workItems.some(matchesWorkFilters))
  ));
  const selectedWorkItems = filteredWorkItems.filter((item) => selectedIds.includes(item.id));
  const selectedCustomerOrders = customerOrders.filter((order) => selectedOrderIds.includes(order.id));
  const error = tab === "work" ? workError : customerError;
  const dashboardTotals = Object.values(workData?.dashboard ?? {}).reduce<Record<DeliveryMethod, number>>(
    (totals, statusTotals) => ({
      onsite_sale: totals.onsite_sale + statusTotals.onsite_sale,
      onsite_reservation: totals.onsite_reservation + statusTotals.onsite_reservation,
      delivery: totals.delivery + statusTotals.delivery,
    }),
    { onsite_sale: 0, onsite_reservation: 0, delivery: 0 },
  );
  const stageTotals = PIPELINE_WORK_STATUSES.reduce((totals, status) => {
    const channelTotals = workData?.dashboard[status];
    totals[status] = channelTotals
      ? channelTotals.onsite_sale + channelTotals.onsite_reservation + channelTotals.delivery
      : 0;
    return totals;
  }, {} as Record<PipelineWorkStatus, number>);

  const reloadActive = async () => {
    await Promise.all([
      reloadWork({ silent: true }),
      tab === "customers" ? reloadCustomers({ silent: true }) : Promise.resolve(),
    ]);
  };

  const saveWorkItem = async (item: import("./WorkItemEditor").EditableWorkItem, draft: WorkDraft) => {
    const response = await fetch("/api/work-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        expectedVersion: item.version,
        changes: toWorkItemChanges(draft),
      }),
    });
    await responseData(response);
    setSelectedWorkItem(null);
    setNotice("작업 행을 저장했습니다.");
    await reloadActive();
  };

  const updateWork = async (item: WorkItem, changes: Record<string, unknown>, noticeText: string) => {
    try {
      const response = await fetch("/api/work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, expectedVersion: item.version, changes }),
      });
      await responseData(response);
      setNotice(noticeText);
      await reloadActive();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "작업을 변경하지 못했습니다.");
    }
  };

  const duplicateWork = async (item: WorkItem) => {
    try {
      const response = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: item.id, expectedVersion: item.version }),
      });
      await responseData(response);
      setNotice("작업 행을 복제했습니다.");
      await reloadActive();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "작업 행을 복제하지 못했습니다.");
    }
  };

  const runBulk = async (payload: Record<string, unknown>, noticeText: string) => {
    try {
      const response = await fetch("/api/work-items/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, items: selectedWorkItems.map((item) => ({ id: item.id, expectedVersion: item.version })) }),
      });
      await responseData(response);
      setSelectedIds([]);
      setNotice(noticeText);
      await reloadActive();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "일괄 처리를 저장하지 못했습니다.");
    }
  };

  const deleteWorkItems = async () => {
    if (!deleteSelection?.length) return;
    try {
      if (deleteSelection.length === 1) {
        const response = await fetch("/api/work-items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deleteSelection[0]),
        });
        await responseData(response);
      } else {
        const response = await fetch("/api/work-items/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", items: deleteSelection }),
        });
        await responseData(response);
      }
      setSelectedIds([]);
      setSelectedWorkItem(null);
      setDeleteSelection(null);
      setNotice(`${deleteSelection.length}개 작업 행을 삭제했습니다.`);
      await reloadActive();
    } catch (caught) {
      setDeleteSelection(null);
      setNotice(caught instanceof Error ? caught.message : "작업 행을 삭제하지 못했습니다.");
    }
  };

  const savePayment = async (order: CustomerOrder, paymentStatus: PaymentStatus, paidAmount: number) => {
    const response = await fetch("/api/orders/payment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        expectedVersion: order.version,
        paymentStatus,
        paidAmount,
      }),
    });
    await responseData(response);
    setPaymentOrder(null);
    setNotice("결제 상태와 금액을 저장했습니다.");
    await reloadActive();
  };

  const createWorkItem = async (order: CustomerOrder, draft: WorkDraft, idempotencyKey: string) => {
    const response = await fetch("/api/work-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        orderId: order.id,
        expectedOrderVersion: order.version,
        idempotencyKey,
        productId: draft.productId,
        unitPrice: Number(draft.unitPrice),
        quantity: Number(draft.quantity),
        deliveryMethod: draft.deliveryMethod,
        dueAt: toDueAt(draft.dueAt),
        workStatus: draft.workStatus,
        recipientName: nullable(draft.recipientName),
        recipientPhone: nullable(draft.recipientPhone),
        postalCode: nullable(draft.postalCode),
        roadAddr: nullable(draft.roadAddr),
        roadAddrReference: nullable(draft.roadAddrReference),
        jibunAddr: nullable(draft.jibunAddr),
        detailAddr: nullable(draft.detailAddr),
        customizationJson: nullable(draft.customizationJson),
        note: draft.note,
      }),
    });
    await responseData(response);
    setNewWorkOrder(null);
    setNotice("새 작업 행을 추가했습니다.");
    await reloadActive();
  };

  const createOrder = async (draft: OrderDraft, workItems: WorkDraft[], idempotencyKey: string) => {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "manual-create",
        idempotencyKey,
        buyerName: draft.buyerName,
        buyerPhone: draft.buyerPhone,
        items: workItems.map((item) => ({
          productId: item.productId,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity),
          deliveryMethod: item.deliveryMethod,
          dueAt: toDueAt(item.dueAt),
          recipientName: nullable(item.recipientName),
          recipientPhone: nullable(item.recipientPhone),
          postalCode: nullable(item.postalCode),
          roadAddr: nullable(item.roadAddr),
          roadAddrReference: nullable(item.roadAddrReference),
          jibunAddr: nullable(item.jibunAddr),
          detailAddr: nullable(item.detailAddr),
          customizationJson: nullable(item.customizationJson),
          workStatus: item.workStatus,
          note: item.note,
        })),
      }),
    });
    await responseData(response);
    setNewOrderOpen(false);
    setTab("customers");
    setNotice(workItems.length ? "새 주문과 작업 항목을 추가했습니다." : "새 주문을 추가했습니다. 작업 항목을 추가해주세요.");
  };

  const saveOrder = async (selection: OrderSelection, draft: OrderDraft) => {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selection.order.id,
        expectedVersion: selection.order.version,
        changes: {
          orderNo: draft.orderNo,
          buyerName: draft.buyerName,
          buyerPhone: draft.buyerPhone,
        },
      }),
    });
    await responseData(response);
    setSelectedOrder(null);
    setNotice("주문자 정보를 저장했습니다.");
    await reloadActive();
  };

  const deleteOrderById = async () => {
    if (!deleteOrder) return;
    try {
      const response = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deleteOrder.order.id,
          expectedVersion: deleteOrder.order.version,
        }),
      });
      await responseData(response);
      setDeleteOrder(null);
      setSelectedOrder(null);
      setNotice("주문을 삭제했습니다.");
      await reloadActive();
    } catch (caught) {
      setDeleteOrder(null);
      setNotice(caught instanceof Error ? caught.message : "주문을 삭제하지 못했습니다.");
    }
  };

  const confirmDuplicate = async () => {
    if (!duplicateRequest) return;
    const request = duplicateRequest;
    setDuplicateRequest(null);
    if (request.kind === "item") {
      await duplicateWork(request.item);
      return;
    }
    await runBulk({ action: "duplicate" }, "선택한 작업 행을 복제했습니다.");
  };

  const columns: DataTableColumn<WorkItem>[] = [
    {
      id: "dueAt",
      header: "수령일시",
      cell: (item) => <><b>{item.dueAt.slice(0, 10)}</b><small>{item.deliveryMethod === "delivery" ? "발송 예정" : item.dueAt.slice(11, 16)}</small></>,
      sortValue: (item) => item.dueAt,
      width: "118px",
      cellLayout: "stacked",
    },
    {
      id: "customer",
      header: "주문자",
      cell: (item) => <><b>{item.buyerName}</b><small>{item.buyerPhone} · {item.orderNo}</small></>,
      sortValue: (item) => item.buyerName,
      width: "180px",
      cellLayout: "stacked",
    },
    {
      id: "product",
      header: "상품",
      cell: (item) => <><b>{item.productName}</b>{item.productDailyLimit !== null && item.productScheduledQuantity > item.productDailyLimit ? <small className="sales-work-table__overage">일일 수량 초과 {item.productScheduledQuantity}/{item.productDailyLimit}</small> : null}</>,
      sortValue: (item) => item.productName,
      cellLayout: "stacked",
      multiline: true,
    },
    {
      id: "quantity",
      header: "수량",
      cell: (item) => <><b>{item.quantity}개</b><small>{won(item.lineTotal)}</small></>,
      sortValue: (item) => item.quantity,
      align: "right",
      width: "90px",
      cellLayout: "stacked",
    },
    {
      id: "delivery",
      header: "수령방법",
      cell: (item) => <Badge tone={DELIVERY_TONES[item.deliveryMethod]}>{DELIVERY_LABELS[item.deliveryMethod]}</Badge>,
      sortValue: (item) => DELIVERY_LABELS[item.deliveryMethod],
      width: "104px",
    },
    {
      id: "status",
      header: "작업상태",
      cell: (item) => item.workStatus === "received" ? (
        <div className="sales-work-table__actions">
          <Button
            size="sm"
            variant="primary"
            onClick={(event) => {
              event.stopPropagation();
              void updateWork(item, { workStatus: "confirmed" }, `${workStatusLabel("confirmed")} 상태로 변경했습니다.`);
            }}
          >
            작업 준비
          </Button>
        </div>
      ) : <Badge tone={workStatusTone(item.workStatus)}>{WORK_STATUS_LABELS[item.workStatus]}</Badge>,
      sortValue: (item) => item.workStatus,
      width: "96px",
    },
    {
      id: "payment",
      header: "결제",
      cell: (item) => <Badge tone={paymentStatusTone(item.paymentStatus)}>{PAYMENT_STATUS_LABELS[item.paymentStatus]}</Badge>,
      width: "92px",
    },
    {
      id: "actions",
      header: "처리",
      cell: (item) => <div className="sales-work-table__actions">
        <Button
          size="sm"
          variant={item.customerArrivedAt ? "ghost" : "primary"}
          onClick={(event) => {
            event.stopPropagation();
            void updateWork(item, { customerArrivedAt: item.customerArrivedAt ? null : true }, item.customerArrivedAt ? "주문 도착 기록을 취소했습니다." : "주문 도착을 기록했습니다.");
          }}
        >
          {item.customerArrivedAt ? "도착 취소" : "주문 도착"}
        </Button>
      </div>,
      width: "96px",
    },
  ];
  const orderColumns: DataTableColumn<CustomerOrderRow>[] = [
    {
      id: "createdAt",
      header: "주문 일시",
      cell: (order) => <time dateTime={order.createdAt}>{formatWorkItemDateTime(order.createdAt)}</time>,
      sortValue: (order) => order.createdAt,
      width: "174px",
    },
    {
      id: "orderNo",
      header: "주문번호",
      cell: (order) => <b>{order.orderNo}</b>,
      sortValue: (order) => order.orderNo,
      width: "144px",
    },
    {
      id: "customer",
      header: "주문자",
      cell: (order) => <><b>{order.buyerName}</b><small>{order.buyerPhone}</small></>,
      sortValue: (order) => order.buyerName,
      width: "156px",
      rowHeader: true,
      cellLayout: "stacked",
    },
    {
      id: "workItems",
      header: "작업",
      cell: (order) => order.workItems.length ? (
        <><b>{order.workItems.map((item) => `${item.productName} ${item.quantity}개`).join(", ")}</b><small>{order.workItems.length}개 작업</small></>
      ) : <span>작업 미등록</span>,
      sortValue: (order) => order.workItems.map((item) => item.productName).join(" "),
      cellLayout: "stacked",
      multiline: true,
    },
    {
      id: "payment",
      header: "결제",
      cell: (order) => <Badge tone={paymentStatusTone(order.paymentStatus)}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>,
      sortValue: (order) => order.paymentStatus,
      width: "96px",
    },
    {
      id: "amount",
      header: "결제 금액",
      cell: (order) => <><b>{won(order.paidAmount)} / {won(order.totalAmount)}</b><small className={order.balance > 0 ? "sales-work-table__balance" : undefined}>{order.balance > 0 ? `미수 ${won(order.balance)}` : "미수 없음"}</small></>,
      sortValue: (order) => order.balance,
      align: "right",
      width: "168px",
      cellLayout: "stacked",
    },
    {
      id: "actions",
      header: "처리",
      cell: (order) => <div className="sales-work-table__order-actions">
        <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setSelectedOrder({ order, buyerName: order.buyerName, buyerPhone: order.buyerPhone }); }}>주문 수정</Button>
        <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setNewWorkOrder(order); }}>작업 추가</Button>
        <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setPaymentOrder(order); }}>결제 변경</Button>
      </div>,
      width: "268px",
    },
  ];

  return (
    <div className="sales-work-table">
      <OperationsPageHeader title="정일품 판매장" description="주문 관리" href="/sales" />
      <AppNav current="sales" />

      <main className="sales-work-table__main">
        <section className="sales-work-table__dashboard" aria-label="작업 수량 필터">
          <div className="sales-work-table__filter-group">
            <button
              type="button"
              className="sales-work-table__filter-button"
              aria-pressed={!workStatus && !deliveryMethod && !outstandingOnly}
              onClick={() => {
                setWorkStatus("");
                setDeliveryMethod("");
                setOutstandingOnly(false);
                setSelectedIds([]);
                setSelectedOrderIds([]);
              }}
            >
              <span>전체</span>
              <b>{dashboardTotals.onsite_sale + dashboardTotals.onsite_reservation + dashboardTotals.delivery}</b>
            </button>
            {(["onsite_sale", "onsite_reservation", "delivery"] as const).map((method) => (
              <button
                key={method}
                type="button"
                className="sales-work-table__filter-button"
                aria-pressed={deliveryMethod === method}
                onClick={() => {
                  setDeliveryMethod(deliveryMethod === method ? "" : method);
                  setSelectedIds([]);
                  setSelectedOrderIds([]);
                }}
              >
                <span>{DELIVERY_LABELS[method]}</span>
                <b>{dashboardTotals[method]}</b>
              </button>
            ))}
            <button
              type="button"
              className="sales-work-table__filter-button"
              aria-pressed={outstandingOnly}
              onClick={() => {
                setOutstandingOnly((current) => !current);
                setSelectedIds([]);
                setSelectedOrderIds([]);
              }}
            >
              <span>미수 결제</span>
            </button>
          </div>
          <span className="sales-work-table__filter-divider" aria-hidden="true" />
          <div className="sales-work-table__filter-group">
            {PIPELINE_WORK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="sales-work-table__filter-button"
                aria-pressed={workStatus === status}
                onClick={() => {
                  setWorkStatus(workStatus === status ? "" : status);
                  setSelectedIds([]);
                  setSelectedOrderIds([]);
                }}
              >
                <span>{WORK_STATUS_LABELS[status]}</span>
                <b>{stageTotals[status]}</b>
              </button>
            ))}
          </div>
        </section>

        <Tabs
          ariaLabel="판매장 화면 선택"
          value={tab}
          onValueChange={(value) => {
            setTab(value as Tab);
            setSelectedIds([]);
            setSelectedOrderIds([]);
          }}
          items={[
            { id: "work", label: "작업", count: filteredWorkItems.length },
            { id: "customers", label: "주문", count: customerOrders.length },
          ]}
        />

        <Toolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "성함 / 전화번호 / 주문번호 / 상품명 검색",
            label: "작업 및 주문 검색",
          }}
          filters={<>
            <FieldSelect id="sales-work-status-filter" label={<span className="sr-only">작업 상태</span>} value={workStatus} onChange={(event) => {
              setWorkStatus(event.target.value);
              setSelectedIds([]);
              setSelectedOrderIds([]);
            }}>
              <option value="">모든 작업 상태</option>
              {WORK_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{WORK_STATUS_LABELS[status]}</option>
              ))}
            </FieldSelect>
            <FieldSelect id="sales-delivery-method-filter" label={<span className="sr-only">수령방법</span>} value={deliveryMethod} onChange={(event) => {
              setDeliveryMethod(event.target.value);
              setSelectedIds([]);
              setSelectedOrderIds([]);
            }}>
              <option value="">모든 수령방법</option>
              {Object.entries(DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </FieldSelect>
            <DateRangeNavigator
              ariaLabel="조회 기간"
              dateFrom={currentDateFrom}
              dateFromId="sales-date-from"
              dateFromLabel={<span className="sr-only">조회 시작일</span>}
              dateTo={currentDateTo}
              dateToId="sales-date-to"
              dateToLabel={<span className="sr-only">조회 종료일</span>}
              onChange={(dateFrom, dateTo) => {
                if (tab === "work") {
                  setWorkDateFrom(dateFrom);
                  setWorkDateTo(dateTo ?? "");
                  setSelectedIds([]);
                  return;
                }
                setCustomerDateFrom(dateFrom);
                setCustomerDateTo(dateTo ?? "");
                setSelectedOrderIds([]);
              }}
            />
          </>}
          actions={<Button size="sm" onClick={() => setNewOrderOpen(true)}>새 주문</Button>}
          selectionCount={tab === "work" ? selectedWorkItems.length : selectedCustomerOrders.length}
        >
          {tab === "work" && selectedWorkItems.length ? (
            <BulkActions
              onRun={runBulk}
              onDelete={() => setDeleteSelection(selectedWorkItems.map((item) => ({ id: item.id, expectedVersion: item.version })))}
              onDuplicate={() => setDuplicateRequest({ kind: "selection", count: selectedWorkItems.length })}
            />
          ) : null}
        </Toolbar>

        {error ? <p className="sales-work-table__error" role="alert">{error.message}</p> : null}

        {tab === "work" ? (
          <section className="sales-work-table__section" aria-label="작업 목록">
            <DataTable
              ariaLabel="판매장 작업 목록"
              rows={filteredWorkItems}
              columns={columns}
              getRowId={(item) => item.id}
              rowClassName={workItemRowClass}
              onRowClick={setSelectedWorkItem}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              emptyMessage="조건에 맞는 작업이 없습니다."
            />
          </section>
        ) : (
          <section className="sales-work-table__section" aria-label="주문 목록">
            <DataTable
              ariaLabel="판매장 주문 목록"
              rows={customerOrders}
              columns={orderColumns}
              getRowId={(order) => order.id}
              rowClassName={outstandingPaymentRowClass}
              onRowClick={(order) => setSelectedOrder({ order, buyerName: order.buyerName, buyerPhone: order.buyerPhone })}
              selectedIds={selectedOrderIds}
              onSelectedIdsChange={setSelectedOrderIds}
              emptyMessage="조건에 맞는 주문이 없습니다."
            />
          </section>
        )}
      </main>

      {selectedWorkItem ? (
        <SharedWorkItemEditor
          key={`${selectedWorkItem.id}-${selectedWorkItem.version}`}
          item={selectedWorkItem}
          description={`${selectedWorkItem.orderNo} · ${selectedWorkItem.buyerName} · ${selectedWorkItem.buyerPhone} · 결제 ${won(selectedWorkItem.paidAmount)} / 주문 ${won(selectedWorkItem.totalAmount)}`}
          onClose={() => setSelectedWorkItem(null)}
          onSave={saveWorkItem}
          onDelete={() => setDeleteSelection([{ id: selectedWorkItem.id, expectedVersion: selectedWorkItem.version }])}
          onDuplicate={() => {
            setSelectedWorkItem(null);
            setDuplicateRequest({ kind: "item", item: selectedWorkItem });
          }}
        />
      ) : null}
      {selectedOrder ? (
        <OrderEditor
          key={`${selectedOrder.order.id}-${selectedOrder.order.version}`}
          title="주문 수정"
          description={selectedOrder.order.orderNo}
          initialDraft={{
            orderNo: selectedOrder.order.orderNo,
            buyerName: selectedOrder.buyerName,
            buyerPhone: selectedOrder.buyerPhone,
          }}
          workItems={selectedOrder.order.workItems}
          submitLabel="저장"
          onClose={() => setSelectedOrder(null)}
          onSave={(draft) => saveOrder(selectedOrder, draft)}
          onDelete={() => setDeleteOrder(selectedOrder)}
        />
      ) : null}
      {newOrderOpen ? (
        <NewOrderEditor
          onClose={() => setNewOrderOpen(false)}
          onCreate={createOrder}
        />
      ) : null}
      {newWorkOrder ? (
        <NewWorkItemEditor
          key={`${newWorkOrder.id}-${newWorkOrder.version}`}
          order={newWorkOrder}
          onClose={() => setNewWorkOrder(null)}
          onCreate={createWorkItem}
        />
      ) : null}
      {paymentOrder ? (
        <PaymentEditor
          key={`${paymentOrder.id}-${paymentOrder.version}`}
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onSave={savePayment}
        />
      ) : null}
      <Modal
        open={Boolean(deleteSelection)}
        title="작업 행을 삭제하시겠습니까?"
        description="삭제한 작업 행은 되돌릴 수 없습니다."
        onClose={() => setDeleteSelection(null)}
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteSelection(null)}>취소</Button>
          <Button variant="danger" onClick={() => void deleteWorkItems()}>삭제</Button>
        </>}
      >
        <p>{deleteSelection?.length ?? 0}개 작업 행과 연결된 작업 정보를 삭제합니다.</p>
      </Modal>
      <Modal
        open={Boolean(deleteOrder)}
        title="주문을 삭제하시겠습니까?"
        description="연결된 작업 행과 패키지 정보도 함께 삭제되며 되돌릴 수 없습니다."
        onClose={() => setDeleteOrder(null)}
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteOrder(null)}>취소</Button>
          <Button variant="danger" onClick={() => void deleteOrderById()}>삭제</Button>
        </>}
      >
        <p>{deleteOrder?.order.orderNo ?? ""} 주문을 삭제합니다.</p>
      </Modal>
      <Modal
        open={Boolean(duplicateRequest)}
        title="작업 행을 복제하시겠습니까?"
        description="동일한 작업 상태와 수령 정보를 가진 새 작업 행이 생성됩니다."
        onClose={() => setDuplicateRequest(null)}
        footer={<>
          <Button variant="ghost" onClick={() => setDuplicateRequest(null)}>취소</Button>
          <Button onClick={() => void confirmDuplicate()}>복제</Button>
        </>}
      >
        <p>{duplicateRequest?.kind === "selection" ? `${duplicateRequest.count}개 작업 행을 복제합니다.` : "선택한 작업 행을 복제합니다."}</p>
      </Modal>
      {notice ? <div className="ops-toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기">×</button></div> : null}
    </div>
  );
}

function BulkActions({
  onRun,
  onDelete,
  onDuplicate,
}: {
  onRun: (payload: Record<string, unknown>, noticeText: string) => Promise<void>;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [nextStatus, setNextStatus] = useState<WorkStatus>("confirmed");
  const [nextDueAt, setNextDueAt] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [paidAmount, setPaidAmount] = useState("0");

  return (
    <div className="sales-work-table__bulk-actions" aria-label="선택 작업 일괄 처리">
      <div className="sales-work-table__bulk-action-groups">
        <div className="sales-work-table__bulk-action" role="group" aria-label="작업 상태 일괄 변경">
          <WorkStatusSelect id="sales-bulk-work-status" label="작업 상태" value={nextStatus} onChange={setNextStatus} />
          <Button size="sm" variant="ghost" onClick={() => void onRun({ action: "status", workStatus: nextStatus }, "작업 상태를 일괄 변경했습니다.")}>상태 변경</Button>
        </div>
        <div className="sales-work-table__bulk-action" role="group" aria-label="수령일시 일괄 변경">
          <FieldInput id="sales-bulk-due-at" label="수령일시" type="datetime-local" value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} />
          <Button size="sm" variant="ghost" disabled={!nextDueAt} onClick={() => void onRun({ action: "due_at", dueAt: toDueAt(nextDueAt) }, "수령일시를 일괄 변경했습니다.")}>수령일시 변경</Button>
        </div>
        <div className="sales-work-table__bulk-action sales-work-table__bulk-action--payment" role="group" aria-label="결제 일괄 변경">
          <FieldSelect id="sales-bulk-payment-status" label="결제 상태" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FieldSelect>
          <FieldInput id="sales-bulk-paid-amount" label="결제 금액" type="number" min="0" step="1" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
          <Button size="sm" variant="ghost" disabled={!Number.isInteger(Number(paidAmount)) || Number(paidAmount) < 0} onClick={() => void onRun({ action: "payment", paymentStatus, paidAmount: Number(paidAmount) }, "결제 정보를 일괄 변경했습니다.")}>결제 변경</Button>
        </div>
      </div>
      <div className="sales-work-table__bulk-immediate-actions" aria-label="즉시 실행">
        <Button size="sm" variant="ghost" onClick={onDuplicate}>복제</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>삭제</Button>
      </div>
    </div>
  );
}

function OrderEditor({
  title,
  description,
  initialDraft,
  workItems,
  submitLabel,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  description: string;
  initialDraft: OrderDraft;
  workItems: WorkItem[];
  submitLabel: string;
  onClose: () => void;
  onSave: (draft: OrderDraft) => Promise<void>;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formId = onDelete ? "sales-order-editor" : "sales-new-order-editor";

  const update = <Key extends keyof OrderDraft>(key: Key, value: OrderDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "주문을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={onClose}
      footer={<>
        {onDelete ? <Button variant="ghost" style={{ marginRight: "auto", borderColor: "#a42f28", color: "#a42f28" }} onClick={onDelete}>삭제</Button> : null}
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        <Button disabled={saving} onClick={() => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()}>{saving ? "저장 중" : submitLabel}</Button>
      </>}
    >
      <form id={formId} className="sales-work-table__editor" onSubmit={submit}>
        <div className="sales-work-table__editor-grid">
          <FieldInput id={`${formId}-order-no`} label="주문번호" value={draft.orderNo} onChange={(event) => update("orderNo", event.target.value)} />
          <FieldInput id={`${formId}-buyer-name`} label="주문자 성함" value={draft.buyerName} onChange={(event) => update("buyerName", event.target.value)} />
          <FieldInput id={`${formId}-buyer-phone`} label="주문자 전화번호" inputMode="tel" value={draft.buyerPhone} onChange={(event) => update("buyerPhone", event.target.value)} />
        </div>
        {error ? <p className="sales-work-table__error" role="alert">{error}</p> : null}
      </form>
      <DataTable
        ariaLabel="주문 세부 작업"
        rows={workItems}
        columns={[
          { id: "product", header: "상품", cell: (item) => item.productName, rowHeader: true, multiline: true },
          { id: "quantity", header: "수량", cell: (item) => `${item.quantity.toLocaleString()}개`, align: "right", width: "88px" },
          { id: "delivery", header: "수령방법", cell: (item) => DELIVERY_LABELS[item.deliveryMethod], width: "104px" },
          { id: "dueAt", header: "수령일시", cell: (item) => item.dueAt.slice(0, 16), width: "164px" },
          { id: "status", header: "작업 상태", cell: (item) => WORK_STATUS_LABELS[item.workStatus], width: "108px" },
          { id: "note", header: "메모", cell: (item) => item.note || "없음", multiline: true },
        ]}
        getRowId={(item) => item.id}
        emptyMessage="등록된 세부 작업이 없습니다."
      />
    </Modal>
  );
}

function NewOrderEditor({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (draft: OrderDraft, workItems: WorkDraft[], idempotencyKey: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<OrderDraft>({ orderNo: "", buyerName: "", buyerPhone: "" });
  const [workItems, setWorkItems] = useState<NewOrderWorkItem[]>(() => [{
    id: crypto.randomUUID(),
    draft: emptyWorkDraft(),
  }]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateOrder = <Key extends keyof OrderDraft>(key: Key, value: OrderDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateWorkItem = <Key extends keyof WorkDraft>(id: string, key: Key, value: WorkDraft[Key]) => {
    setWorkItems((current) => current.map((item) => (
      item.id === id ? { ...item, draft: { ...item.draft, [key]: value } } : item
    )));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalidItemIndex = workItems.findIndex((item) => workDraftError(item.draft));
    if (invalidItemIndex !== -1) {
      setError(`작업 항목 ${invalidItemIndex + 1}: ${workDraftError(workItems[invalidItemIndex].draft)}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(draft, workItems.map((item) => item.draft), idempotencyKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "새 주문을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="새 주문 추가"
      description="주문과 필요한 작업 항목을 함께 등록합니다."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        <Button disabled={saving} onClick={() => (document.getElementById("sales-new-order-editor") as HTMLFormElement | null)?.requestSubmit()}>{saving ? "저장 중" : "추가"}</Button>
      </>}
    >
      <form id="sales-new-order-editor" className="sales-work-table__editor" onSubmit={submit}>
        <div className="sales-work-table__editor-grid">
          <FieldInput id="new-order-buyer-name" label="주문자 성함" value={draft.buyerName} onChange={(event) => updateOrder("buyerName", event.target.value)} />
          <FieldInput id="new-order-buyer-phone" label="주문자 전화번호" inputMode="tel" value={draft.buyerPhone} onChange={(event) => updateOrder("buyerPhone", event.target.value)} />
        </div>
        {workItems.map((item, index) => (
          <section key={item.id} className="sales-work-table__editor" aria-label={`작업 항목 ${index + 1}`}>
            <div>
              <strong>작업 항목 {index + 1}</strong>
              <Button size="sm" variant="ghost" onClick={() => setWorkItems((current) => current.filter((value) => value.id !== item.id))}>행 삭제</Button>
            </div>
            <SharedWorkItemFields
              draft={item.draft}
              idPrefix={`new-order-${item.id}`}
              onChange={(key, value) => updateWorkItem(item.id, key, value)}
            />
          </section>
        ))}
        <Button variant="ghost" onClick={() => setWorkItems((current) => [...current, { id: crypto.randomUUID(), draft: emptyWorkDraft() }])}>작업 항목 추가</Button>
        {error ? <p className="sales-work-table__error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

function NewWorkItemEditor({
  order,
  onClose,
  onCreate,
}: {
  order: CustomerOrder;
  onClose: () => void;
  onCreate: (order: CustomerOrder, draft: WorkDraft, idempotencyKey: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WorkDraft>(emptyWorkDraft);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = <Key extends keyof WorkDraft>(key: Key, value: WorkDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = workDraftError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(order, draft, idempotencyKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "새 작업 행을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="새 작업 행 추가"
      description={`${order.orderNo} · 기존 주문 금액 ${won(order.totalAmount)}`}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        <Button disabled={saving} onClick={() => (document.getElementById("sales-new-work-editor") as HTMLFormElement | null)?.requestSubmit()}>{saving ? "저장 중" : "추가"}</Button>
      </>}
    >
      <form id="sales-new-work-editor" className="sales-work-table__editor" onSubmit={submit}>
        <SharedWorkItemFields draft={draft} idPrefix="new-work" onChange={update} />
        {error ? <p className="sales-work-table__error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

function PaymentEditor({
  order,
  onClose,
  onSave,
}: {
  order: CustomerOrder;
  onClose: () => void;
  onSave: (order: CustomerOrder, paymentStatus: PaymentStatus, paidAmount: number) => Promise<void>;
}) {
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [paidAmount, setPaidAmount] = useState(String(order.paidAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isInteger(Number(paidAmount)) || Number(paidAmount) < 0) {
      setError("결제 금액은 0 이상의 정수여야 합니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(order, paymentStatus, Number(paidAmount));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결제 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="결제 상태 변경"
      description={`${order.orderNo} · 주문 금액 ${won(order.totalAmount)}`}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
        <Button disabled={saving} onClick={() => (document.getElementById("sales-payment-editor") as HTMLFormElement | null)?.requestSubmit()}>{saving ? "저장 중" : "저장"}</Button>
      </>}
    >
      <form id="sales-payment-editor" className="sales-work-table__payment-editor" onSubmit={submit}>
        <p>현재 결제 금액 <strong>{won(order.paidAmount)}</strong></p>
        <FieldSelect id="sales-payment-status" label="결제 상태" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FieldSelect>
        <FieldInput id="sales-paid-amount" label="결제 금액" type="number" min="0" step="1" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} hint="주문 금액보다 큰 금액도 운영자가 기록할 수 있습니다." />
        {error ? <p className="sales-work-table__error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}
