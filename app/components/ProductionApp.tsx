"use client";

import { useRef, useState } from "react";
import type { ProductionBatch, ProductionOverview, RecentProductionTrace } from "../lib/production-types";
import { operationalDateFromSearch } from "../lib/operational-date";
import type { DataTableColumn } from "../ui";
import { Button, DataTable, FieldInput, FieldSelect, OperationsPageHeader, useResource } from "../ui";
import AppNav from "./AppNav";
import "../workshop-flow.css";

const todayInSeoul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const initialProductionDate = () => typeof window === "undefined"
  ? todayInSeoul()
  : operationalDateFromSearch(window.location.search) ?? todayInSeoul();
type TraceForm = { rawScan: string; origin: string; slaughterhouse: string; cattleType: string; grade: string; productionTarget: string; storageMethod: string; expiryText: string; packagingMaterial: string; foodType: string };
const emptyTrace = (): TraceForm => ({ rawScan: "", origin: "", slaughterhouse: "", cattleType: "", grade: "", productionTarget: "", storageMethod: "", expiryText: "", packagingMaterial: "", foodType: "" });

export default function ProductionApp() {
  const [date, setDate] = useState(initialProductionDate);
  const [overview, setOverview] = useState<ProductionOverview>({ requirements: [], missingProducts: [], batches: [], recentTraceability: [] });
  const [selectedCode, setSelectedCode] = useState("");
  const [manualComponentCode, setManualComponentCode] = useState("");
  const [manualCutName, setManualCutName] = useState("");
  const [form, setForm] = useState<TraceForm>(emptyTrace);
  const [batchForms, setBatchForms] = useState<Record<string, TraceForm>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const {
    reload: load,
  } = useResource<ProductionOverview>(
    `/api/workshop/production?date=${encodeURIComponent(date)}`,
    2500,
    {
      onData: (loadedOverview) => {
        setOverview(loadedOverview);
        setTargets(Object.fromEntries(loadedOverview.batches.map((batch) => [batch.id, String(batch.productionTarget)])));
        setSelectedCode((current) => loadedOverview.requirements.some((item) => item.componentCode === current) ? current : "");
        setError("");
      },
      onError: (resourceError) => setError(resourceError.message || "생산 현황을 불러오지 못했습니다."),
    },
  );

  async function post(body: object, key: string, success: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workshop/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string; skinPackCode?: string; batchId?: string; alreadyApplied?: boolean };
      if (!response.ok) throw new Error(data.error || "생산 작업을 저장하지 못했습니다.");
      setNotice(data.skinPackCode ? `${data.skinPackCode} 생성 완료` : success);
      await load();
      return data;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "생산 작업을 저장하지 못했습니다."); throw caught; }
    finally { setBusy(""); }
  }

  function applyRecent(trace: RecentProductionTrace, target: "new" | string) {
    const values = { rawScan: trace.traceabilityNo, origin: trace.origin, slaughterhouse: trace.slaughterhouse, cattleType: trace.cattleType, grade: trace.grade };
    if (target === "new") setForm((current) => ({ ...current, ...values }));
    else setBatchForms((current) => ({ ...current, [target]: { ...(current[target] ?? emptyTrace()), ...values } }));
  }

  async function createBatch(source: "manual" | "hid" | "recent" = "manual") {
    const requirement = overview.requirements.find((item) => item.componentCode === selectedCode);
    const componentCode = requirement?.componentCode ?? manualComponentCode.trim();
    const cutName = requirement?.componentName ?? manualCutName.trim();
    if (!componentCode || !cutName) { setError("생산 품목 코드와 명칭을 입력해주세요."); return; }
    try {
      await post({ action: "create_batch", date, componentCode, cutName, productionTarget: Number(form.productionTarget), rawScan: form.rawScan, origin: form.origin, slaughterhouse: form.slaughterhouse, cattleType: form.cattleType, grade: form.grade, storageMethod: form.storageMethod, expiryText: form.expiryText, packagingMaterial: form.packagingMaterial, foodType: form.foodType, source }, "create", "생산 batch를 시작했습니다.");
      setForm(emptyTrace());
      setManualComponentCode("");
      setManualCutName("");
    } catch { /* 오류 영역에서 안내 */ }
  }

  async function createSkinPack(batch: ProductionBatch) {
    const weightG = Number(weights[batch.id]);
    try {
      await post({ action: "create_skin_pack", batchId: batch.id, weightG, idempotencyKey: crypto.randomUUID() }, `pack:${batch.id}`, "스킨팩을 생성했습니다.");
      setWeights((current) => ({ ...current, [batch.id]: "" }));
      requestAnimationFrame(() => weightRefs.current[batch.id]?.focus());
    } catch { requestAnimationFrame(() => weightRefs.current[batch.id]?.focus()); }
  }

  async function adjustTarget(batch: ProductionBatch) {
    try { await post({ action: "adjust_target", batchId: batch.id, productionTarget: Number(targets[batch.id]) }, `target:${batch.id}`, "생산목표를 조정했습니다."); } catch { /* 오류 영역 */ }
  }

  async function changeTrace(batch: ProductionBatch, source: "manual" | "hid" | "recent" = "manual") {
    const next = batchForms[batch.id] ?? emptyTrace();
    try {
      await post({ action: "change_traceability", batchId: batch.id, productionTarget: Number(next.productionTarget), rawScan: next.rawScan, origin: next.origin, slaughterhouse: next.slaughterhouse, cattleType: next.cattleType, grade: next.grade, storageMethod: next.storageMethod, expiryText: next.expiryText, packagingMaterial: next.packagingMaterial, foodType: next.foodType, source }, `trace:${batch.id}`, "새 이력번호 구간을 시작했습니다.");
      setBatchForms((current) => ({ ...current, [batch.id]: emptyTrace() }));
    } catch { /* 오류 영역 */ }
  }

  const requirementColumns: DataTableColumn<ProductionOverview["requirements"][number]>[] = [
    {
      id: "component",
      header: "부위",
      cell: (item) => <><strong>{item.componentName}</strong><small>{item.componentCode}</small></>,
      cellLayout: "stacked",
    },
    {
      id: "source-products",
      header: "연결 상품",
      cell: (item) => item.sourceProducts.join(", "),
      align: "center",
      multiline: true,
    },
    {
      id: "required",
      header: "필요",
      cell: (item) => item.requiredQuantity,
      align: "center",
    },
    {
      id: "available",
      header: "가용",
      cell: (item) => item.availableQuantity,
      align: "center",
    },
    {
      id: "additional",
      header: "추가 생산",
      cell: (item) => <b>{item.additionalNeeded}</b>,
      align: "center",
    },
  ];

  return <div className="workshop-app production-app">
    <OperationsPageHeader
      title="정일품 생산장"
      description="BATCH & SKIN PACK"
      href="/workshop"
      actions={(
        <FieldInput
          id="production-date"
          className="ops-header__field"
          label="생산 기준일"
          aria-label="생산 기준일"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      )}
    />
    <AppNav current="workshop" />
    <main className="workshop-main production-main">
      {error && <div className="package-message error" role="alert">{error}</div>}{notice && <div className="package-message" role="status">{notice}</div>}
      {overview.missingProducts.length > 0 && <section className="production-warning"><b>BOM 미등록 상품</b><p>아래 상품은 임의 계산하지 않습니다. product_components 등록 후 생산량에 포함됩니다.</p><ul>{overview.missingProducts.map((item) => <li key={item.productId}>{item.productName} × {item.quantity}</li>)}</ul></section>}
      <section className="production-board requirement-board">
        <header>
          <div><small>CUT REQUIREMENTS</small><h2>부위별 필요 생산량</h2></div>
          <p>필요수량 − 가용 스킨팩 = 추가 생산량</p>
        </header>
        <DataTable
          ariaLabel="부위별 필요 생산량"
          rows={overview.requirements}
          columns={requirementColumns}
          getRowId={(item) => item.componentCode}
          onRowClick={(item) => {
            setSelectedCode(item.componentCode);
            setForm((current) => ({ ...current, productionTarget: String(item.additionalNeeded) }));
          }}
          emptyMessage="선택 날짜에 BOM이 연결된 생산 수요가 없습니다."
        />
      </section>
      <section id="traceability" className="package-panel batch-create"><header><div><small>START BATCH</small><h2>생산 batch 시작</h2></div><p>주문 수요를 참고할 수 있으며, 수동 품목으로도 생산 batch를 생성합니다.</p></header><div className="batch-form-grid"><FieldSelect id="production-requirement" label="주문 수요" value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}><option value="">수동 품목 입력</option>{overview.requirements.map((item) => <option key={item.componentCode} value={item.componentCode}>{item.componentName} ({item.componentCode})</option>)}</FieldSelect>{!selectedCode ? <><FieldInput id="manual-component-code" label="품목 코드" value={manualComponentCode} onChange={(event) => setManualComponentCode(event.target.value)} /><FieldInput id="manual-cut-name" label="품목 명칭" value={manualCutName} onChange={(event) => setManualCutName(event.target.value)} /></> : null}<TraceFields form={form} setForm={setForm} onEnter={() => void createBatch("hid")} /><Button disabled={busy === "create"} onClick={() => void createBatch()}>{busy === "create" ? "시작 중" : "batch 시작"}</Button></div><RecentTraces values={overview.recentTraceability} onUse={(trace) => applyRecent(trace, "new")} /></section>
      <section id="skin-packs" className="batch-list"><header><div><small>ACTIVE BATCHES</small><h2>생산 batch와 스킨팩 등록</h2></div><p>중량 저장 1회가 스킨팩 1개와 라벨 1개를 생성합니다.</p></header>{overview.batches.map((batch) => <article key={batch.id} className={batch.status === "in_progress" ? "active" : "complete"}><header><div><small>{batch.componentCode} · SEGMENT {batch.segmentNo}</small><h3>{batch.cutName}</h3><p>이력번호 <code>{batch.traceabilityNo}</code> · {batch.origin || "원산지 미입력"} · {batch.grade || "등급 미입력"}</p></div><strong>{batch.producedQuantity} / {batch.productionTarget}</strong></header><div className="batch-metrics"><span>당일 필요 <b>{batch.requiredQuantity}</b></span><span>시작 가용 <b>{batch.availableQuantityAtStart}</b></span><span>추가 필요 <b>{batch.additionalNeeded}</b></span></div>{batch.status === "in_progress" && <><div className="pack-entry"><label><span>다음 스킨팩 중량(g)</span><input ref={(node) => { weightRefs.current[batch.id] = node; }} type="number" min="1" step="1" value={weights[batch.id] ?? ""} onChange={(event) => setWeights((current) => ({ ...current, [batch.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createSkinPack(batch); } }} /></label><button disabled={busy === `pack:${batch.id}`} onClick={() => void createSkinPack(batch)}>저장 + 다음 팩</button></div><div className="batch-adjust"><label><span>생산목표 조정</span><input type="number" value={targets[batch.id] ?? batch.productionTarget} onChange={(event) => setTargets((current) => ({ ...current, [batch.id]: event.target.value }))} /></label><button onClick={() => void adjustTarget(batch)}>목표 저장</button><button onClick={() => void post({ action: "complete_batch", batchId: batch.id }, `complete:${batch.id}`, "batch 완료")}>batch 완료</button></div><details className="trace-change"><summary>이력번호 변경 · 새 구간 시작</summary><div className="batch-form-grid"><TraceFields form={batchForms[batch.id] ?? emptyTrace()} setForm={(next) => setBatchForms((current) => ({ ...current, [batch.id]: typeof next === "function" ? next(current[batch.id] ?? emptyTrace()) : next }))} onEnter={() => void changeTrace(batch, "hid")} /><button onClick={() => void changeTrace(batch)}>현재 구간 완료 후 변경</button></div><RecentTraces values={overview.recentTraceability} onUse={(trace) => applyRecent(trace, batch.id)} /></details></>}<footer><span>{batch.status === "completed" ? "완료된 불변 구간" : "진행 중"}</span><a href={`/api/workshop/production/batches/${encodeURIComponent(batch.id)}/csv`}>스킨팩 long CSV</a></footer></article>)}{!overview.batches.length && <div className="workshop-empty">선택 날짜에 생성된 생산 batch가 없습니다.</div>}</section>
    </main>
  </div>;
}

function TraceFields({ form, setForm, onEnter }: { form: TraceForm; setForm: React.Dispatch<React.SetStateAction<TraceForm>>; onEnter: () => void }) {
  const field = (key: keyof TraceForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <><label><span>생산목표</span><input type="number" min="0" step="1" value={form.productionTarget} onChange={(event) => field("productionTarget", event.target.value)} /></label><label className="trace-scan"><span>이력번호 스캔·입력</span><input inputMode="numeric" value={form.rawScan} onChange={(event) => field("rawScan", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }} placeholder="숫자 입력 후 Enter" /></label><label><span>원산지</span><input value={form.origin} onChange={(event) => field("origin", event.target.value)} /></label><label><span>도축장</span><input value={form.slaughterhouse} onChange={(event) => field("slaughterhouse", event.target.value)} /></label><label><span>축종</span><input value={form.cattleType} onChange={(event) => field("cattleType", event.target.value)} /></label><label><span>등급</span><input value={form.grade} onChange={(event) => field("grade", event.target.value)} /></label><label><span>보관방법</span><input value={form.storageMethod} onChange={(event) => field("storageMethod", event.target.value)} /></label><label><span>소비기한 문구</span><input value={form.expiryText} onChange={(event) => field("expiryText", event.target.value)} /></label><label><span>포장재질</span><input value={form.packagingMaterial} onChange={(event) => field("packagingMaterial", event.target.value)} /></label><label><span>식품유형</span><input value={form.foodType} onChange={(event) => field("foodType", event.target.value)} /></label></>;
}

function RecentTraces({ values, onUse }: { values: RecentProductionTrace[]; onUse: (trace: RecentProductionTrace) => void }) {
  if (!values.length) return null;
  return <div className="recent-traces"><span>최근 사용</span>{values.map((trace) => <button key={trace.traceabilityNo} onClick={() => onUse(trace)}>{trace.traceabilityNo}</button>)}</div>;
}
