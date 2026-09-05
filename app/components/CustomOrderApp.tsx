"use client";

import { useEffect, useState } from "react";
import { FormattedInput } from "../ui";
import { parseIntegerInput } from "../lib/input-format";
import type { OrderDraft } from "./types";

const budgetOptions = [
  { label: "20만원대", amount: 200_000 },
  { label: "25만원대", amount: 250_000 },
  { label: "30만원대", amount: 300_000 },
  { label: "40만원대", amount: 400_000 },
  { label: "50만원 이상", amount: 500_000 },
] as const;

type Draft = {
  budgetOption: string;
  directAmount: string;
  request: string;
};

const initialDraft: Draft = {
  budgetOption: "",
  directAmount: "",
  request: "",
};

const customStorageKey = "jeongilpum-custom-order-draft";
const kioskStorageKey = "jeongilpum-kiosk-draft";

function selectedAmount(draft: Draft) {
  if (draft.budgetOption === "금액 직접 입력") {
    return parseIntegerInput(draft.directAmount) ?? 0;
  }
  return budgetOptions.find((option) => option.label === draft.budgetOption)?.amount ?? 0;
}

export default function CustomOrderApp() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<{ budget?: string }>({});

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = sessionStorage.getItem(customStorageKey);
      if (saved) {
        try {
          setDraft({ ...initialDraft, ...(JSON.parse(saved) as Partial<Draft>) });
        } catch {
          sessionStorage.removeItem(customStorageKey);
        }
      } else {
        const kioskSaved = sessionStorage.getItem(kioskStorageKey);
        if (kioskSaved) {
          try {
            const customItem = (JSON.parse(kioskSaved) as Partial<OrderDraft>).customItem;
            if (customItem) {
              setDraft({
                budgetOption: customItem.budgetOption,
                directAmount: customItem.budgetOption === "금액 직접 입력" ? String(customItem.budgetAmount) : "",
                request: customItem.request ?? "",
              });
            }
          } catch {
            setDraft(initialDraft);
          }
        }
      }
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem(customStorageKey, JSON.stringify(draft));
  }, [draft, hydrated]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "budgetOption" || key === "directAmount") {
      setErrors((current) => ({ ...current, budget: undefined }));
    }
  };

  const complete = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = selectedAmount(draft);
    const nextErrors: typeof errors = {};
    if (!draft.budgetOption) nextErrors.budget = "예산을 선택해주세요.";
    else if (amount < 200_000) nextErrors.budget = "맞춤주문은 20만원부터 가능합니다.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    let orderDraft: Partial<OrderDraft> = {};
    const saved = sessionStorage.getItem(kioskStorageKey);
    if (saved) {
      try {
        orderDraft = JSON.parse(saved) as Partial<OrderDraft>;
      } catch {
        orderDraft = {};
      }
    }
    orderDraft.customItem = {
      budgetOption: draft.budgetOption,
      budgetAmount: amount,
      request: draft.request.trim(),
    };
    orderDraft.idempotencyKey = crypto.randomUUID();
    sessionStorage.setItem(kioskStorageKey, JSON.stringify(orderDraft));
    sessionStorage.setItem(customStorageKey, JSON.stringify(draft));
    window.location.assign("/kiosk?resume=cart");
  };

  return (
    <main className="custom-order-page">
      <header className="custom-top">
        <a href="/kiosk">← 상품 주문으로</a>
        <span>正 정일품</span>
      </header>
      <section className="custom-hero">
        <small>CUSTOM ORDER</small>
        <h1>맞춤 주문</h1>
        <p>예산과 요청사항을 알려주세요.</p>
      </section>
      <form className="custom-form" onSubmit={complete} noValidate>
        <section>
          <h2><span>1</span> 예산</h2>
          <div className="choice-grid three">
            {budgetOptions.map((option) => (
              <button
                type="button"
                key={option.label}
                className={draft.budgetOption === option.label ? "selected" : ""}
                onClick={() => set("budgetOption", option.label)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={draft.budgetOption === "금액 직접 입력" ? "selected" : ""}
              onClick={() => set("budgetOption", "금액 직접 입력")}
            >
              금액 직접 입력
            </button>
          </div>
          {draft.budgetOption === "금액 직접 입력" && (
            <label className="custom-wide" htmlFor="custom-order-direct-amount">
              <span>직접 입력 금액</span>
              <FormattedInput
                id="custom-order-direct-amount"
                format="number"
                value={draft.directAmount}
                aria-invalid={Boolean(errors.budget)}
                onValueChange={(value) => set("directAmount", value)}
                placeholder="200000"
              />
            </label>
          )}
          {errors.budget && <span className="field-error" role="alert">{errors.budget}</span>}
        </section>

        <section>
          <h2><span>2</span> 요청사항 <small>(선택)</small></h2>
          <label className="custom-wide">
            <span>요청사항</span>
            <textarea value={draft.request} onChange={(event) => set("request", event.target.value)} />
          </label>
        </section>

        <p className="custom-safe">요청하신 내용을 확인한 후 직원이 최종 구성을 확정합니다.</p>
        <button type="submit" className="custom-submit">
          완료 <span>→</span>
        </button>
      </form>
    </main>
  );
}
