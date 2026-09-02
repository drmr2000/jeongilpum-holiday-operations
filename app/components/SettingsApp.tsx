/* eslint-disable @next/next/no-img-element */
"use client";

import { FolderPlus, GripVertical, ImageOff, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import OpsHeader from "./OpsHeader";
import {
  Badge,
  Button,
  DataTable,
  Field,
  FieldInput,
  FieldSelect,
  FieldTextarea,
  Modal,
  Toolbar,
  useResource,
  type DataTableColumn,
} from "../ui";

type CatalogProduct = {
  id: string;
  category: string;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  customerDisplayWeight: string | null;
  imageUrl: string | null;
  badge: string | null;
  dailyLimit: number | null;
  reservedQuantity: number;
};

type CatalogResponse = {
  products?: CatalogProduct[];
};

type ProductRevision = {
  id: string;
  active: boolean;
  imageUrl: string | null;
  sortOrder: number;
  version: string;
};

type ProductRecord = {
  id: string;
  category: string;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  displayWeight: string | null;
  imageUrl: string | null;
  previewImageUrl: string | null;
  badge: string | null;
  dailyLimit: number | null;
  sortOrder: number;
  active: boolean;
  version: string;
  reservedQuantity: number;
};

type CategoryRecord = {
  id: string;
  name: string;
  sortOrder: number;
  version: string;
  productCount: number;
};

type SettingsResponse = {
  productRevisions?: ProductRevision[];
  inactiveProducts?: ProductRecord[];
  categories?: CategoryRecord[];
};

type ProductDraft = {
  category: string;
  name: string;
  subtitle: string;
  description: string;
  price: string;
  displayWeight: string;
  badge: string;
  imageUrl: string;
  active: boolean;
  dailyLimit: string;
  version: string;
};

type BulkAction = "daily-limit" | "category" | "active" | null;

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const formattedInteger = (value: number) => value.toLocaleString("ko-KR");

function numericText(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

function parsedInteger(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function draftFor(product: ProductRecord): ProductDraft {
  return {
    category: product.category,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    price: formattedInteger(product.price),
    displayWeight: product.displayWeight ?? "",
    badge: product.badge ?? "",
    imageUrl: product.imageUrl ?? "",
    active: product.active,
    dailyLimit: product.dailyLimit === null ? "" : String(product.dailyLimit),
    version: product.version,
  };
}

function emptyDraft(category: string): ProductDraft {
  return {
    category,
    name: "",
    subtitle: "",
    description: "",
    price: "",
    displayWeight: "",
    badge: "",
    imageUrl: "",
    active: true,
    dailyLimit: "",
    version: "",
  };
}

function productRows(catalog: CatalogResponse | null, settings: SettingsResponse | null) {
  const revisions = new Map((settings?.productRevisions ?? []).map((item) => [item.id, item]));
  const activeProducts = (catalog?.products ?? []).flatMap((product) => {
    const revision = revisions.get(product.id);
    if (!revision || !revision.active) return [];
    return [{
      id: product.id,
      category: product.category,
      name: product.name,
      subtitle: product.subtitle,
      description: product.description,
      price: product.price,
      displayWeight: product.customerDisplayWeight,
      imageUrl: revision.imageUrl,
      previewImageUrl: product.imageUrl,
      badge: product.badge,
      dailyLimit: product.dailyLimit,
      sortOrder: revision.sortOrder,
      active: revision.active,
      version: revision.version,
      reservedQuantity: product.reservedQuantity,
    }];
  });

  return [...activeProducts, ...(settings?.inactiveProducts ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR"));
}

function orderedProducts(
  products: ProductRecord[],
  categories: CategoryRecord[],
  categoryOrder: Record<string, string[]>,
) {
  const categoryIndexes = new Map(categories.map((category, index) => [category.name, index]));

  return [...products].sort((left, right) => {
    if (left.category !== right.category) {
      const leftIndex = categoryIndexes.get(left.category);
      const rightIndex = categoryIndexes.get(right.category);
      return (leftIndex ?? categories.length) - (rightIndex ?? categories.length)
        || left.category.localeCompare(right.category, "ko-KR");
    }

    const order = categoryOrder[left.category];
    if (order) {
      const leftIndex = order.indexOf(left.id);
      const rightIndex = order.indexOf(right.id);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }

    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR");
  });
}

function withCategoryOverrides(products: ProductRecord[], categoryAssignment: Record<string, string>) {
  if (!Object.keys(categoryAssignment).length) return products;
  return products.map((product) => {
    const category = categoryAssignment[product.id];
    return category && category !== product.category ? { ...product, category } : product;
  });
}

function productGroups(products: ProductRecord[]) {
  const groups = new Map<string, ProductRecord[]>();
  for (const product of products) {
    const group = groups.get(product.category) ?? [];
    group.push(product);
    groups.set(product.category, group);
  }

  return [...groups.entries()].map(([category, rows]) => ({ category, rows }));
}

async function settingsMutation(method: "PATCH" | "POST", payload: Record<string, unknown>, fallback: string) {
  const response = await fetch("/api/settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null) as { error?: string; removal?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? fallback);
  return data;
}

export default function SettingsApp() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<Record<string, string[]>>({});
  const [categoryAssignment, setCategoryAssignment] = useState<Record<string, string>>({});
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkDailyLimit, setBulkDailyLimit] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkActive, setBulkActive] = useState<"visible" | "hidden">("visible");
  const [deletingProduct, setDeletingProduct] = useState<ProductRecord | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [inlineCategoryEdit, setInlineCategoryEdit] = useState<CategoryRecord | null>(null);
  const [inlineCategoryName, setInlineCategoryName] = useState("");
  const [inlineCategorySaving, setInlineCategorySaving] = useState(false);
  const inlineCategoryInput = useRef<HTMLInputElement>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryRecord | null>(null);
  const [notice, setNotice] = useState("");
  const {
    data: catalog,
    error: catalogError,
    loading: catalogLoading,
    reload: reloadCatalog,
  } = useResource<CatalogResponse>("/api/products", 2500);
  const {
    data: settings,
    error: settingsError,
    loading: settingsLoading,
    reload: reloadSettings,
  } = useResource<SettingsResponse>("/api/settings", 2500);
  const categories = settings?.categories ?? [];
  const categoryNames = categories.map((category) => category.name);
  const selectedBulkCategory = categoryNames.includes(bulkCategory) ? bulkCategory : categoryNames[0] ?? "";
  const products = orderedProducts(withCategoryOverrides(productRows(catalog, settings), categoryAssignment), categories, categoryOrder);
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const visibleProducts = normalizedQuery
    ? products.filter((product) => `${product.name} ${product.subtitle} ${product.category}`.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
    : products;
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id));
  const loading = catalogLoading || settingsLoading;
  const error = catalogError ?? settingsError;

  useEffect(() => {
    if (!inlineCategoryEdit) return;
    inlineCategoryInput.current?.focus();
    inlineCategoryInput.current?.select();
  }, [inlineCategoryEdit]);

  const reload = async () => {
    await Promise.all([reloadCatalog(), reloadSettings()]);
  };

  const openEditor = (product: ProductRecord) => {
    setEditing(product);
    setDraft(draftFor(product));
  };

  const openCreate = () => {
    if (!categoryNames[0]) {
      setNotice("상품을 추가하려면 카테고리를 먼저 등록해주세요.");
      return;
    }
    setEditing(null);
    setDraft(emptyDraft(categoryNames[0]));
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setDraft(null);
  };

  const updateDraft = <Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const clearPendingMove = (categoryNamesToClear: string[], productIds: string[] = []) => {
    setCategoryOrder((current) => {
      const next = { ...current };
      for (const category of categoryNamesToClear) delete next[category];
      return next;
    });
    if (!productIds.length) return;
    setCategoryAssignment((current) => {
      const next = { ...current };
      for (const id of productIds) delete next[id];
      return next;
    });
  };

  const resetPendingMoves = () => {
    setCategoryOrder({});
    setCategoryAssignment({});
  };

  const runReorder = async (action: () => Promise<void>, rollback: () => void, errorFallback: string) => {
    setReordering(true);
    setNotice("");
    try {
      await action();
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : errorFallback);
    } finally {
      rollback();
      setReordering(false);
      setDraggedProductId(null);
    }
  };

  const persistOrder = (category: string, rows: ProductRecord[]) => runReorder(
    () => settingsMutation("PATCH", {
      type: "product-reorder",
      category,
      items: rows.map((product) => ({ id: product.id, expectedVersion: product.version })),
    }, "상품 순서를 저장하지 못했습니다.").then(() => undefined),
    () => clearPendingMove([category]),
    "상품 순서를 저장하지 못했습니다.",
  );

  const persistCategoryMove = (source: ProductRecord, targetCategory: string, orderedRows: ProductRecord[]) => runReorder(
    async () => {
      await settingsMutation("PATCH", {
        type: "product-bulk",
        action: "category",
        items: [{ id: source.id, expectedVersion: source.version }],
        category: targetCategory,
      }, "카테고리를 변경하지 못했습니다.");
      const [nextCatalog, nextSettings] = await Promise.all([reloadCatalog(), reloadSettings()]);
      const refreshedById = new Map(
        productRows(nextCatalog ?? null, nextSettings ?? null).map((product) => [product.id, product]),
      );
      const items = orderedRows
        .map((product) => refreshedById.get(product.id))
        .filter((product): product is ProductRecord => Boolean(product))
        .map((product) => ({ id: product.id, expectedVersion: product.version }));
      await settingsMutation("PATCH", { type: "product-reorder", category: targetCategory, items }, "상품 순서를 저장하지 못했습니다.");
    },
    () => clearPendingMove([source.category, targetCategory], [source.id]),
    "카테고리를 변경하지 못했습니다.",
  );

  const relocateProduct = (sourceId: string, targetCategory: string, targetId: string | null) => {
    if (reordering) return;
    const source = products.find((product) => product.id === sourceId);
    if (!source) return;
    if (source.category === targetCategory && sourceId === targetId) return;

    const destinationRows = products.filter((product) => product.category === targetCategory && product.id !== sourceId);
    const targetIndex = targetId ? destinationRows.findIndex((product) => product.id === targetId) : -1;
    const nextRows = [...destinationRows];
    nextRows.splice(targetIndex < 0 ? nextRows.length : targetIndex, 0, source);
    setCategoryOrder((current) => ({ ...current, [targetCategory]: nextRows.map((product) => product.id) }));

    if (source.category === targetCategory) {
      void persistOrder(targetCategory, nextRows);
      return;
    }

    setCategoryAssignment((current) => ({ ...current, [sourceId]: targetCategory }));
    void persistCategoryMove(source, targetCategory, nextRows);
  };

  const stepProduct = (productId: string, direction: -1 | 1) => {
    const source = products.find((product) => product.id === productId);
    if (!source) return;
    const categoryRows = products.filter((product) => product.category === source.category);
    const target = categoryRows[categoryRows.findIndex((product) => product.id === productId) + direction];
    if (!target) return;
    relocateProduct(productId, source.category, target.id);
  };

  const saveProduct = async () => {
    if (!draft) return;
    const price = parsedInteger(draft.price);
    const dailyLimit = draft.dailyLimit.trim() ? parsedInteger(draft.dailyLimit) : null;

    if (price === null || (draft.dailyLimit.trim() && dailyLimit === null)) {
      setNotice("가격과 한정수량은 0 이상의 정수로 입력해주세요.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      if (editing) {
        await settingsMutation("PATCH", {
          type: "product",
          id: editing.id,
          expectedVersion: draft.version,
          category: draft.category,
          name: draft.name,
          subtitle: draft.subtitle,
          description: draft.description,
          price,
          displayWeight: draft.displayWeight,
          badge: draft.badge,
          imageUrl: draft.imageUrl,
          sortOrder: editing.sortOrder,
          active: draft.active,
          dailyLimit,
        }, "상품을 저장하지 못했습니다.");
      } else {
        await settingsMutation("POST", {
          type: "product",
          category: draft.category,
          name: draft.name,
          subtitle: draft.subtitle,
          description: draft.description,
          price,
          displayWeight: draft.displayWeight,
          badge: draft.badge,
          imageUrl: draft.imageUrl,
          active: draft.active,
          dailyLimit,
        }, "상품을 추가하지 못했습니다.");
      }
      await reload();
      setNotice(`${draft.name.trim()} 상품을 ${editing ? "저장" : "추가"}했습니다.`);
      setEditing(null);
      setDraft(null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "상품을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    setSaving(true);
    setNotice("");
    try {
      const result = await settingsMutation("PATCH", {
        type: "product-delete",
        id: deletingProduct.id,
        expectedVersion: deletingProduct.version,
      }, "상품을 삭제하지 못했습니다.");
      await reload();
      setSelectedIds((current) => current.filter((id) => id !== deletingProduct.id));
      setEditing(null);
      setDraft(null);
      setDeletingProduct(null);
      setNotice(
        result?.removal === "history-preserved"
          ? `${deletingProduct.name} 상품을 목록에서 삭제했습니다. 주문 이력은 보존됩니다.`
          : `${deletingProduct.name} 상품을 삭제했습니다.`,
      );
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "상품을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const saveBulkAction = async () => {
    if (!bulkAction || !selectedProducts.length) return;
    const dailyLimit = bulkDailyLimit.trim() ? parsedInteger(bulkDailyLimit) : null;
    if (bulkAction === "daily-limit" && bulkDailyLimit.trim() && dailyLimit === null) {
      setNotice("한정수량은 0 이상의 정수로 입력해주세요.");
      return;
    }
    if (bulkAction === "category" && !selectedBulkCategory) {
      setNotice("카테고리를 선택해주세요.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      await settingsMutation("PATCH", {
        type: "product-bulk",
        action: bulkAction,
        items: selectedProducts.map((product) => ({ id: product.id, expectedVersion: product.version })),
        ...(bulkAction === "daily-limit" ? { dailyLimit } : {}),
        ...(bulkAction === "category" ? { category: selectedBulkCategory } : {}),
        ...(bulkAction === "active" ? { active: bulkActive === "visible" } : {}),
      }, "선택한 상품을 변경하지 못했습니다.");
      await reload();
      setSelectedIds([]);
      setBulkAction(null);
      setNotice(`${selectedProducts.length}개 상품을 변경했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "선택한 상품을 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setNotice("카테고리 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      await settingsMutation("PATCH", { type: "category-create", name }, "카테고리를 추가하지 못했습니다.");
      await reload();
      resetPendingMoves();
      setNewCategoryName("");
      setNotice(`${name} 카테고리를 추가했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "카테고리를 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const persistCategoryName = async (category: CategoryRecord, name: string) => {
    await settingsMutation("PATCH", {
      type: "category-update",
      id: category.id,
      expectedVersion: category.version,
      name,
    }, "카테고리 이름을 저장하지 못했습니다.");
    await reload();
    resetPendingMoves();
  };

  const clearCategoryDraft = (categoryId: string) => {
    setCategoryDrafts((current) => {
      const next = { ...current };
      delete next[categoryId];
      return next;
    });
  };

  const saveCategory = async (category: CategoryRecord) => {
    const name = (categoryDrafts[category.id] ?? category.name).trim();
    if (!name) {
      setNotice("카테고리 이름을 입력해주세요.");
      return;
    }
    if (name === category.name) return;

    setSaving(true);
    setNotice("");
    try {
      await persistCategoryName(category, name);
      clearCategoryDraft(category.id);
      setNotice(`${category.name} 카테고리를 ${name}(으)로 변경했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "카테고리 이름을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const openInlineCategoryEditor = (category: CategoryRecord) => {
    if (saving || inlineCategorySaving) return;
    setInlineCategoryEdit(category);
    setInlineCategoryName(category.name);
    setNotice("");
  };

  const closeInlineCategoryEditor = () => {
    if (inlineCategorySaving) return;
    setInlineCategoryEdit(null);
    setInlineCategoryName("");
  };

  const saveInlineCategory = async () => {
    if (!inlineCategoryEdit || inlineCategorySaving) return;
    const category = inlineCategoryEdit;
    const name = inlineCategoryName.trim();

    if (!name) {
      closeInlineCategoryEditor();
      setNotice("카테고리 이름을 입력해주세요.");
      return;
    }
    if (name === category.name) {
      closeInlineCategoryEditor();
      return;
    }

    setInlineCategorySaving(true);
    setNotice("");
    try {
      await persistCategoryName(category, name);
      clearCategoryDraft(category.id);
      setNotice(`${category.name} 카테고리를 ${name}(으)로 변경했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "카테고리 이름을 저장하지 못했습니다.");
    } finally {
      setInlineCategoryEdit(null);
      setInlineCategoryName("");
      setInlineCategorySaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!deletingCategory) return;
    setSaving(true);
    setNotice("");
    try {
      await settingsMutation("PATCH", {
        type: "category-delete",
        id: deletingCategory.id,
        expectedVersion: deletingCategory.version,
      }, "카테고리를 삭제하지 못했습니다.");
      await reload();
      resetPendingMoves();
      setDeletingCategory(null);
      setNotice(`${deletingCategory.name} 카테고리를 삭제했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "카테고리를 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const columns: DataTableColumn<ProductRecord>[] = [
    {
      id: "handle",
      header: "순서",
      cell: (product) => (
        <button
          type="button"
          className="settings-row-handle"
          draggable={!reordering}
          disabled={reordering}
          aria-label={`${product.name} 순서 이동, 화살표 키로 같은 카테고리 내에서 이동`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            stepProduct(product.id, event.key === "ArrowUp" ? -1 : 1);
          }}
          onDragStart={(event: DragEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", product.id);
            setDraggedProductId(product.id);
          }}
          onDragEnd={() => setDraggedProductId(null)}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      ),
      width: "56px",
    },
    {
      id: "thumbnail",
      header: "사진",
      cell: (product) => {
        const thumbnailUrl = product.previewImageUrl ?? product.imageUrl;
        return <span className="settings-product-thumb">
          {thumbnailUrl
            ? <img src={thumbnailUrl} alt={`${product.name} 상품 사진`} />
            : <ImageOff size={16} aria-hidden="true" />}
        </span>;
      },
      width: "64px",
      align: "center",
    },
    {
      id: "name",
      header: "이름",
      cell: (product) => <span className="settings-product-name"><b>{product.name}</b>{product.subtitle ? <small>{product.subtitle}</small> : null}</span>,
      width: "250px",
    },
    {
      id: "price",
      header: "가격",
      cell: (product) => won(product.price),
      width: "120px",
      align: "right",
    },
    {
      id: "daily-limit",
      header: "한정수량",
      cell: (product) => product.dailyLimit === null
        ? <Badge tone="neutral">무제한</Badge>
        : <Badge tone={product.dailyLimit === 0 ? "danger" : "info"}>{product.dailyLimit.toLocaleString("ko-KR")}세트</Badge>,
      width: "120px",
      align: "center",
    },
    {
      id: "remaining",
      header: "잔여",
      cell: (product) => {
        if (product.dailyLimit === null) return <Badge tone="neutral">무제한</Badge>;
        const remaining = Math.max(0, product.dailyLimit - product.reservedQuantity);
        return <Badge tone={remaining <= product.dailyLimit * 0.25 ? "danger" : "success"}>
          {remaining.toLocaleString("ko-KR")}세트
        </Badge>;
      },
      width: "105px",
      align: "center",
    },
    {
      id: "active",
      header: "노출",
      cell: (product) => <Badge tone={product.active ? "success" : "neutral"}>{product.active ? "노출" : "숨김"}</Badge>,
      width: "90px",
      align: "center",
    },
  ];

  const bulkTitle = bulkAction === "daily-limit"
    ? "한정수량 일괄 설정"
    : bulkAction === "category"
      ? "카테고리 일괄 변경"
      : "노출 상태 일괄 변경";

  return <div className="settings-app">
    <OpsHeader surface="settings" title="정일품 정육식당 설정" subtitle="상품 관리" />
    <main className="settings-main">
      <section className="settings-section settings-toolbar">
        <Toolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "상품명, 부제, 카테고리 검색",
            label: "상품 검색",
          }}
          actions={(
            <>
              <Button variant="ghost" size="sm" leadingIcon={<FolderPlus />} onClick={() => setCategoriesOpen(true)}>카테고리 관리</Button>
              <Button size="sm" leadingIcon={<Plus />} disabled={!categoryNames.length} onClick={openCreate}>새 상품 추가</Button>
            </>
          )}
        />
      </section>
      {selectedProducts.length ? <section className="settings-section">
        <div className="settings-bulk-actions" aria-label="선택 상품 일괄 처리">
          <strong>{selectedProducts.length}개 선택</strong>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setBulkAction("daily-limit")}>한정수량 일괄 설정</Button>
            <Button variant="ghost" size="sm" onClick={() => setBulkAction("category")}>카테고리 변경</Button>
            <Button variant="ghost" size="sm" onClick={() => setBulkAction("active")}>노출 / 숨김 전환</Button>
          </div>
        </div>
      </section> : null}
      {loading && !catalog && !settings ? <div className="settings-loading">상품을 불러오고 있습니다.</div> : null}
      {error ? <div className="access-error" role="alert"><b>상품 관리 화면에 연결할 수 없습니다</b><span>{error.message}</span></div> : null}
      {!error && (catalog || settings) ? <section className="settings-section">
        <DataTable
          columns={columns}
          groups={productGroups(visibleProducts).map(({ category, rows }) => {
            const categoryRecord = categories.find((item) => item.name === category);
            const editingInline = inlineCategoryEdit?.id === categoryRecord?.id;
            return {
              id: category,
              header: <div className="settings-category-heading">
                <div className="settings-category-heading__title">
                  {editingInline ? <div className="settings-category-heading__form">
                    <input
                      aria-label={`${category} 카테고리 이름`}
                      disabled={inlineCategorySaving}
                      ref={inlineCategoryInput}
                      value={inlineCategoryName}
                      onChange={(event) => setInlineCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          closeInlineCategoryEditor();
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveInlineCategory();
                        }
                      }}
                    />
                    <Button
                      aria-label={`${category} 카테고리 이름 저장`}
                      className="settings-category-heading__edit"
                      disabled={inlineCategorySaving}
                      iconOnly
                      leadingIcon={<Save />}
                      size="sm"
                      title="카테고리 이름 저장"
                      variant="ghost"
                      onClick={() => void saveInlineCategory()}
                    />
                  </div> : <>
                    <h2>{category}</h2>
                    {categoryRecord ? <Button
                      aria-label={`${category} 카테고리 이름 수정`}
                      className="settings-category-heading__edit"
                      disabled={saving || inlineCategorySaving}
                      iconOnly
                      leadingIcon={<Pencil />}
                      size="sm"
                      title="카테고리 이름 수정"
                      variant="ghost"
                      onClick={() => openInlineCategoryEditor(categoryRecord)}
                    /> : null}
                  </>}
                </div>
                <span>{rows.length}개</span>
              </div>,
              rows,
            };
          })}
          getRowId={(product) => product.id}
          onRowClick={openEditor}
          onRowDragOver={(product, event) => {
            if (draggedProductId && draggedProductId !== product.id) event.preventDefault();
          }}
          onRowDrop={(product, event) => {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData("text/plain") || draggedProductId;
            if (sourceId) relocateProduct(sourceId, product.category, product.id);
          }}
          onGroupDragOver={(group, event) => {
            if (draggedProductId) event.preventDefault();
          }}
          onGroupDrop={(group, event) => {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData("text/plain") || draggedProductId;
            if (sourceId) relocateProduct(sourceId, group.id, null);
          }}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          emptyMessage="검색 조건에 맞는 상품이 없습니다."
          ariaLabel="상품 목록"
        />
      </section> : null}
    </main>
    <Modal
      open={Boolean(draft)}
      title={editing ? `${editing.name} 수정` : "새 상품 추가"}
      onClose={closeEditor}
      footer={<>
        {editing ? <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setDeletingProduct(editing)} disabled={saving}>삭제</Button> : null}
        <Button variant="ghost" onClick={closeEditor} disabled={saving}>취소</Button>
        <Button leadingIcon={<Save />} onClick={() => void saveProduct()} disabled={saving}>{saving ? "저장 중" : editing ? "저장" : "추가"}</Button>
      </>}
    >
      {draft ? <div className="settings-editor-grid">
        <FieldInput id="product-name" label="이름" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
        <FieldSelect id="product-category" label="카테고리" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)}>
          {categoryNames.map((category) => <option key={category} value={category}>{category}</option>)}
        </FieldSelect>
        <FieldInput id="product-price" label="가격" inputMode="numeric" value={draft.price} onChange={(event) => updateDraft("price", numericText(event.target.value))} />
        <FieldInput id="product-weight" label="중량" value={draft.displayWeight} onChange={(event) => updateDraft("displayWeight", event.target.value)} placeholder="예: 1.8kg" />
        <FieldInput className="settings-editor-grid__wide" id="product-subtitle" label="부제" value={draft.subtitle} onChange={(event) => updateDraft("subtitle", event.target.value)} />
        <FieldTextarea className="settings-editor-grid__wide" id="product-description" label="설명" value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
        <FieldInput id="product-badge" label="뱃지" value={draft.badge} onChange={(event) => updateDraft("badge", event.target.value)} placeholder="예: BEST" />
        <FieldInput
          id="product-daily-limit"
          label="한정수량"
          hint="비우면 무제한입니다."
          inputMode="numeric"
          value={draft.dailyLimit}
          onChange={(event) => updateDraft("dailyLimit", numericText(event.target.value))}
        />
        <FieldInput
          className="settings-editor-grid__wide"
          id="product-image-url"
          label="이미지"
          value={draft.imageUrl}
          onChange={(event) => updateDraft("imageUrl", event.target.value)}
          placeholder="/products/example.webp 또는 https://..."
        />
        <div className="settings-editor-grid__wide">
          {(draft.imageUrl.trim() || editing?.previewImageUrl) ? <img
            className="settings-image-preview"
            src={draft.imageUrl.trim() || editing?.previewImageUrl || ""}
            alt={`${draft.name || editing?.name || "새 상품"} 이미지 미리보기`}
          /> : <Badge tone="neutral">표시할 이미지가 없습니다.</Badge>}
        </div>
        <Field id="product-active" label="키오스크 노출">
          <span className="settings-toggle">
            <input id="product-active" type="checkbox" checked={draft.active} onChange={(event) => updateDraft("active", event.target.checked)} />
            <span>{draft.active ? "노출" : "숨김"}</span>
          </span>
        </Field>
      </div> : null}
    </Modal>
    <Modal
      open={Boolean(deletingProduct)}
      title="상품 삭제"
      description="상품은 상품 관리와 키오스크 목록에서 제거됩니다. 주문, 작업, 패키지 이력이 있으면 해당 이력을 보존한 채 목록에서만 제거합니다."
      onClose={() => {
        if (!saving) setDeletingProduct(null);
      }}
      footer={<>
        <Button variant="ghost" onClick={() => setDeletingProduct(null)} disabled={saving}>취소</Button>
        <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => void deleteProduct()} disabled={saving}>{saving ? "삭제 중" : "삭제"}</Button>
      </>}
    >
      {deletingProduct ? <p className="settings-confirmation">{deletingProduct.name} 상품을 삭제하시겠습니까?</p> : null}
    </Modal>
    <Modal
      open={Boolean(bulkAction)}
      title={bulkTitle}
      onClose={() => {
        if (!saving) setBulkAction(null);
      }}
      footer={<><Button variant="ghost" onClick={() => setBulkAction(null)} disabled={saving}>취소</Button><Button onClick={() => void saveBulkAction()} disabled={saving}>{saving ? "저장 중" : "적용"}</Button></>}
    >
      {bulkAction === "daily-limit" ? <FieldInput
        id="bulk-daily-limit"
        label="한정수량"
        hint="비우면 무제한입니다."
        inputMode="numeric"
        value={bulkDailyLimit}
        onChange={(event) => setBulkDailyLimit(numericText(event.target.value))}
      /> : null}
      {bulkAction === "category" ? <FieldSelect id="bulk-category" label="카테고리" value={selectedBulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
        {categoryNames.map((category) => <option key={category} value={category}>{category}</option>)}
      </FieldSelect> : null}
      {bulkAction === "active" ? <FieldSelect id="bulk-active" label="노출 상태" value={bulkActive} onChange={(event) => setBulkActive(event.target.value as "visible" | "hidden")}>
        <option value="visible">노출</option>
        <option value="hidden">숨김</option>
      </FieldSelect> : null}
    </Modal>
    <Modal
      open={categoriesOpen}
      title="카테고리 관리"
      onClose={() => {
        if (!saving) setCategoriesOpen(false);
      }}
      footer={<Button variant="ghost" onClick={() => setCategoriesOpen(false)} disabled={saving}>닫기</Button>}
    >
      <div className="settings-category-manager">
        <div className="settings-category-create">
          <FieldInput
            id="new-category-name"
            label="새 카테고리 이름"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <Button leadingIcon={<Plus />} onClick={() => void createCategory()} disabled={saving}>카테고리 추가</Button>
        </div>
        <div className="settings-category-table-wrap">
          <table className="settings-category-table">
            <thead>
              <tr><th>카테고리</th><th>상품</th><th>관리</th></tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const categoryName = categoryDrafts[category.id] ?? category.name;
                return <tr key={category.id}>
                  <td><input aria-label={`${category.name} 카테고리 이름`} value={categoryName} onChange={(event) => setCategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))} /></td>
                  <td>{category.productCount}개</td>
                  <td>
                    <div className="settings-category-actions">
                      <Button variant="ghost" size="sm" onClick={() => void saveCategory(category)} disabled={saving || categoryName.trim() === category.name}>이름 저장</Button>
                      <Button variant="danger" size="sm" leadingIcon={<Trash2 />} onClick={() => setDeletingCategory(category)} disabled={saving}>삭제</Button>
                    </div>
                  </td>
                </tr>;
              })}
              {!categories.length ? <tr><td colSpan={3} className="settings-category-empty">등록된 카테고리가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
    <Modal
      open={Boolean(deletingCategory)}
      title="카테고리 삭제"
      description="상품이 하나라도 남아 있으면 카테고리를 삭제할 수 없습니다."
      onClose={() => {
        if (!saving) setDeletingCategory(null);
      }}
      footer={<>
        <Button variant="ghost" onClick={() => setDeletingCategory(null)} disabled={saving}>취소</Button>
        <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => void deleteCategory()} disabled={saving}>{saving ? "삭제 중" : "삭제"}</Button>
      </>}
    >
      {deletingCategory ? <p className="settings-confirmation">{deletingCategory.name} 카테고리를 삭제하시겠습니까?</p> : null}
    </Modal>
    {notice ? <div className="ops-toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="알림 닫기">×</button></div> : null}
  </div>;
}
