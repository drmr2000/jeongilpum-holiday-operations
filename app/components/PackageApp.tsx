"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Badge, Button, SectionTitle, useResource } from "../ui";
import { PACKAGE_STATUS_LABELS, PACKAGE_STATUS_TONES, type PackageStatus } from "../lib/package-status";
import OpsHeader from "./OpsHeader";
import "../workshop-flow.css";

type PackageDetail = {
  packageId: string;
  workItemId: string | null;
  packageCode: string;
  packageStatus: PackageStatus;
  productName: string;
  orderNo: string | null;
  schedule: string | null;
  qrValue: string;
  skinPacks: Array<{
    id: string;
    skinPackCode: string;
    cutName: string;
    componentCode: string;
    quantitySlot: number;
    weightG: number;
    traceabilityNo: string;
    origin: string;
    grade: string;
    manufacturedAt: string;
    storageMethod: string;
    expiryText: string;
    labelStatus: "draft" | "printed" | "void" | null;
  }>;
};

type LabelPreview = {
  packageCode: string;
  productName: string;
  qrValue: string;
  skinPacks: Array<{ skinPackCode: string; cutName: string }>;
};

export default function PackageApp({ packageCode }: { packageCode: string }) {
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [label, setLabel] = useState<LabelPreview | null>(null);
  const [qrData, setQrData] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    reload,
  } = useResource<{ package?: PackageDetail }>(
    `/api/workshop/packages/${encodeURIComponent(packageCode)}`,
    2500,
    {
      onData: (data) => {
        if (!data.package) {
          setError("패키지를 찾을 수 없습니다.");
          return;
        }
        setDetail(data.package);
        setError("");
      },
      onError: (resourceError) => setError(resourceError.message || "패키지 정보를 불러오지 못했습니다."),
    },
  );

  useEffect(() => {
    if (!detail) return;
    void QRCode.toDataURL(detail.qrValue, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setQrData).catch(() => setError("QR을 생성하지 못했습니다."));
  }, [detail]);

  const previewLabel = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workshop/packages/${encodeURIComponent(packageCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_label" }),
      });
      const data = await response.json() as { label?: LabelPreview; error?: string };
      if (!response.ok || !data.label) throw new Error(data.error || "패키지 라벨을 준비하지 못했습니다.");
      setLabel(data.label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "패키지 라벨을 준비하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <div className="package-page">
        <OpsHeader surface="workshop" title="정일품 작업장" />
        <main className="package-loading">{error || "패키지 정보를 불러오는 중입니다."}</main>
      </div>
    );
  }

  return (
    <div className="package-page">
      <OpsHeader surface="workshop" title="정일품 작업장" subtitle={detail.packageCode} />
      <main className="package-main">
        <nav className="package-breadcrumb">
          <a href="/workshop">작업장</a>
          <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/workshop/packages"; }}>패키지</Button>
          <span>{detail.packageCode}</span>
        </nav>
        <section className="package-hero">
          <div>
            <p>{detail.productName}</p>
            <p>{detail.schedule ?? "수동 패키지 · 연결된 작업 일정 없음"}</p>
            <Badge tone={PACKAGE_STATUS_TONES[detail.packageStatus]}>{PACKAGE_STATUS_LABELS[detail.packageStatus]}</Badge>
          </div>
          {qrData ? (
            <figure>
              <Image src={qrData} width={200} height={200} alt={`${detail.packageCode} 내부 QR`} unoptimized />
              <figcaption>고객 개인정보 없는 내부 패키지 QR</figcaption>
            </figure>
          ) : null}
        </section>
        {error ? <div className="package-message error" role="alert">{error}</div> : null}
        <section className="package-panel">
          <SectionTitle
            as="h2"
            title="연결 스킨팩"
            description="패키지와 스킨팩 관계는 작업 항목 상태 변경과 독립적으로 관리합니다."
          />
          <div className="package-components">
            {detail.skinPacks.map((pack) => (
              <article key={pack.id}>
                <div><b>{pack.cutName}</b><small>{pack.skinPackCode}</small></div>
                <p><span>중량</span><strong>{pack.weightG.toLocaleString()}g</strong></p>
                <p><span>이력번호</span><strong>{pack.traceabilityNo}</strong><small>{pack.origin || "원산지 미입력"} · {pack.grade || "등급 미입력"}</small></p>
                <p><span>라벨</span><strong>{pack.labelStatus ?? "미생성"}</strong><small>{pack.expiryText || "소비기한 문구 미입력"}</small></p>
              </article>
            ))}
            {!detail.skinPacks.length ? <p className="package-empty">연결된 스킨팩이 없습니다.</p> : null}
          </div>
        </section>
        <section className="package-panel label-foundation">
          <SectionTitle
            as="h2"
            title="패키지 라벨 미리보기"
            description="미리보기는 패키지 원본 데이터를 변경하지 않습니다."
          />
          <div className="label-actions">
            <Button disabled={busy || !detail.skinPacks.length} onClick={() => void previewLabel()}>
              {busy ? "준비 중" : "라벨 미리보기"}
            </Button>
            <a className={!detail.skinPacks.length ? "disabled" : ""} href={detail.skinPacks.length ? `/api/workshop/packages/${encodeURIComponent(packageCode)}/csv` : undefined}>스킨팩 CSV</a>
            <Button variant="ghost" onClick={() => void reload()}>정보 새로고침</Button>
          </div>
          {label ? (
            <div className="label-preview">
              <small>정일품 선물세트</small>
              <h3>{label.productName}</h3>
              <b>{label.packageCode}</b>
              {label.skinPacks.map((pack) => <div key={pack.skinPackCode}><span>{pack.cutName}</span><code>{pack.skinPackCode}</code></div>)}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
