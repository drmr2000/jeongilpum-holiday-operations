import { env } from "cloudflare:workers";
import { resolveCatalogProductImageUrl } from "../../lib/catalog-product-images";
import { requireOperatorApi } from "../../lib/operator-session";

type ProductRevisionRow = {
  id: string;
  active: number;
  sort_order: number;
  updated_at: string;
};

type InactiveProductRow = {
  id: string;
  category: string;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  display_weight: string | null;
  image_url: string | null;
  badge: string | null;
  daily_limit: number | null;
  sort_order: number;
  active: number;
  updated_at: string;
  reserved_quantity: number;
};

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  updated_at: string;
  product_count: number;
};

type ProductInput = {
  category: string;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  displayWeight: string | null;
  imageUrl: string;
  badge: string | null;
  dailyLimit: number | null;
  active: boolean;
};

type ProductMutationItem = {
  id: string;
  expectedVersion: string;
};

type CountRow = {
  count: number;
};

type SettingsPayload = Record<string, unknown>;

const runtimeEnv = env as typeof env & { DB: D1Database };

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

function nullableText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function imageText(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function productInput(payload: SettingsPayload): ProductInput | null {
  const category = text(payload.category);
  const name = text(payload.name);
  const subtitle = text(payload.subtitle);
  const description = text(payload.description);
  const displayWeight = nullableText(payload.displayWeight);
  const imageUrl = imageText(payload.imageUrl);
  const badge = nullableText(payload.badge);
  const dailyLimit = payload.dailyLimit;

  if (
    !category
    || !name
    || subtitle === undefined
    || description === undefined
    || displayWeight === undefined
    || imageUrl === undefined
    || badge === undefined
    || !isNonnegativeInteger(payload.price)
    || typeof payload.active !== "boolean"
    || (dailyLimit !== null && !isNonnegativeInteger(dailyLimit))
  ) {
    return null;
  }

  return {
    category,
    name,
    subtitle,
    description,
    price: payload.price,
    displayWeight,
    imageUrl,
    badge,
    dailyLimit,
    active: payload.active,
  };
}

function mutationItems(value: unknown): ProductMutationItem[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const items = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const payload = item as Record<string, unknown>;
    const id = text(payload.id);
    const expectedVersion = text(payload.expectedVersion);
    return id && expectedVersion ? { id, expectedVersion } : null;
  });
  if (items.some((item) => item === null)) return null;

  const result = items as ProductMutationItem[];
  return new Set(result.map((item) => item.id)).size === result.length ? result : null;
}

function inactiveProduct(row: InactiveProductRow) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    price: row.price,
    displayWeight: row.display_weight,
    imageUrl: resolveCatalogProductImageUrl(row.id, row.image_url),
    badge: row.badge,
    dailyLimit: row.daily_limit,
    sortOrder: row.sort_order,
    active: Boolean(row.active),
    version: row.updated_at,
    reservedQuantity: row.reserved_quantity,
  };
}

async function activeCategory(name: string) {
  return runtimeEnv.DB.prepare("SELECT id FROM categories WHERE name = ? AND active = 1")
    .bind(name)
    .first<{ id: string }>();
}

async function productExists(id: string) {
  return runtimeEnv.DB.prepare("SELECT id, updated_at FROM products WHERE id = ?")
    .bind(id)
    .first<{ id: string; updated_at: string }>();
}

function invalidProductResponse() {
  return Response.json({ error: "상품 입력값을 확인해주세요." }, { status: 400 });
}

function versionConflictResponse() {
  return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
}

async function updateProduct(payload: SettingsPayload) {
  const id = text(payload.id);
  const expectedVersion = text(payload.expectedVersion);
  const sortOrder = payload.sortOrder;
  const product = productInput(payload);

  if (payload.type !== "product" || !id || !expectedVersion || !product || !isNonnegativeInteger(sortOrder)) {
    return invalidProductResponse();
  }
  if (!await activeCategory(product.category)) {
    return Response.json({ error: "선택한 카테고리를 찾을 수 없습니다." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const update = await runtimeEnv.DB.prepare(`
    UPDATE products
    SET
      category = ?,
      name = ?,
      subtitle = ?,
      description = ?,
      price = ?,
      display_weight = ?,
      image_url = ?,
      badge = ?,
      daily_limit = ?,
      sort_order = ?,
      active = ?,
      updated_at = ?
    WHERE id = ? AND updated_at = ? AND active IN (0, 1)
  `).bind(
    product.category,
    product.name,
    product.subtitle,
    product.description,
    product.price,
    product.displayWeight,
    product.imageUrl,
    product.badge,
    product.dailyLimit,
    sortOrder,
    product.active ? 1 : 0,
    updatedAt,
    id,
    expectedVersion,
  ).run();

  if (update.meta.changes) return Response.json({ ok: true, version: updatedAt, updatedAt });
  if (!await productExists(id)) return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
  return versionConflictResponse();
}

async function createProduct(payload: SettingsPayload) {
  const product = productInput(payload);
  if (payload.type !== "product" || !product) return invalidProductResponse();
  if (!await activeCategory(product.category)) {
    return Response.json({ error: "선택한 카테고리를 찾을 수 없습니다." }, { status: 400 });
  }

  const nextOrder = await runtimeEnv.DB.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order
    FROM products
    WHERE category = ? AND active IN (0, 1)
  `).bind(product.category).first<{ sort_order: number }>();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const code = `MANUAL-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;

  await runtimeEnv.DB.prepare(`
    INSERT INTO products (
      id, category, code, name, subtitle, description, price, display_weight,
      image_url, badge, daily_limit, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    product.category,
    code,
    product.name,
    product.subtitle,
    product.description,
    product.price,
    product.displayWeight,
    product.imageUrl,
    product.badge,
    product.dailyLimit,
    nextOrder?.sort_order ?? 0,
    product.active ? 1 : 0,
    createdAt,
    createdAt,
  ).run();

  return Response.json({ ok: true, id, version: createdAt, createdAt }, { status: 201 });
}

async function bulkUpdateProducts(payload: SettingsPayload) {
  const action = text(payload.action);
  const items = mutationItems(payload.items);
  if (payload.type !== "product-bulk" || !items || !["daily-limit", "category", "active"].includes(action ?? "")) {
    return invalidProductResponse();
  }

  const updatedAt = new Date().toISOString();
  let statements: D1PreparedStatement[];
  if (action === "daily-limit") {
    const dailyLimit = payload.dailyLimit;
    if (dailyLimit !== null && !isNonnegativeInteger(dailyLimit)) return invalidProductResponse();
    statements = items.map((item) => runtimeEnv.DB.prepare(`
      UPDATE products
      SET daily_limit = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? AND active IN (0, 1)
    `).bind(dailyLimit, updatedAt, item.id, item.expectedVersion));
  } else if (action === "category") {
    const category = text(payload.category);
    if (!category || !await activeCategory(category)) {
      return Response.json({ error: "선택한 카테고리를 찾을 수 없습니다." }, { status: 400 });
    }
    statements = items.map((item) => runtimeEnv.DB.prepare(`
      UPDATE products
      SET category = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? AND active IN (0, 1)
    `).bind(category, updatedAt, item.id, item.expectedVersion));
  } else {
    if (typeof payload.active !== "boolean") return invalidProductResponse();
    statements = items.map((item) => runtimeEnv.DB.prepare(`
      UPDATE products
      SET active = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? AND active IN (0, 1)
    `).bind(payload.active ? 1 : 0, updatedAt, item.id, item.expectedVersion));
  }

  const results = await runtimeEnv.DB.batch(statements);
  if (results.some((result) => !result.meta.changes)) return versionConflictResponse();
  return Response.json({ ok: true, version: updatedAt, updatedAt });
}

async function reorderProducts(payload: SettingsPayload) {
  const category = text(payload.category);
  const items = mutationItems(payload.items);
  if (payload.type !== "product-reorder" || !category || !items || !await activeCategory(category)) {
    return invalidProductResponse();
  }

  const updatedAt = new Date().toISOString();
  const results = await runtimeEnv.DB.batch(items.map((item, index) => runtimeEnv.DB.prepare(`
    UPDATE products
    SET sort_order = ?, updated_at = ?
    WHERE id = ? AND category = ? AND updated_at = ? AND active IN (0, 1)
  `).bind(index, updatedAt, item.id, category, item.expectedVersion)));
  if (results.some((result) => !result.meta.changes)) return versionConflictResponse();
  return Response.json({ ok: true, version: updatedAt, updatedAt });
}

async function removeProduct(payload: SettingsPayload) {
  const id = text(payload.id);
  const expectedVersion = text(payload.expectedVersion);
  if (payload.type !== "product-delete" || !id || !expectedVersion) return invalidProductResponse();

  const product = await productExists(id);
  if (!product) return Response.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
  if (product.updated_at !== expectedVersion) return versionConflictResponse();

  const [workItems, packages] = await runtimeEnv.DB.batch<CountRow>([
    runtimeEnv.DB.prepare("SELECT COUNT(*) AS count FROM work_items WHERE product_id = ?").bind(id),
    runtimeEnv.DB.prepare("SELECT COUNT(*) AS count FROM packages WHERE product_id = ?").bind(id),
  ]);
  const referenced = Number(workItems.results[0]?.count ?? 0) + Number(packages.results[0]?.count ?? 0);
  const removedAt = new Date().toISOString();

  if (referenced) {
    const archive = await runtimeEnv.DB.prepare(`
      UPDATE products
      SET active = -1, updated_at = ?
      WHERE id = ? AND updated_at = ? AND active IN (0, 1)
    `).bind(removedAt, id, expectedVersion).run();
    if (!archive.meta.changes) return versionConflictResponse();
    return Response.json({ ok: true, removal: "history-preserved" });
  }

  let removal;
  try {
    removal = await runtimeEnv.DB.prepare("DELETE FROM products WHERE id = ? AND updated_at = ?")
      .bind(id, expectedVersion)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed")) {
      return Response.json(
        { error: "상품 참조 이력이 있어 주문 이력 보존 방식으로만 삭제할 수 있습니다." },
        { status: 409 },
      );
    }
    throw error;
  }
  if (!removal.meta.changes) return versionConflictResponse();
  return Response.json({ ok: true, removal: "deleted" });
}

async function createCategory(payload: SettingsPayload) {
  const name = text(payload.name);
  if (payload.type !== "category-create" || !name) {
    return Response.json({ error: "카테고리 이름을 입력해주세요." }, { status: 400 });
  }

  const nextOrder = await runtimeEnv.DB.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order
    FROM categories
  `).first<{ sort_order: number }>();
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();

  await runtimeEnv.DB.prepare(`
    INSERT INTO categories (
      id, name, sort_order, rail_order, rail_label, rail_assist,
      rail_variant, is_custom_order_link, active, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, NULL, 'default', 0, 1, ?, ?)
  `).bind(id, name, nextOrder?.sort_order ?? 0, name, createdAt, createdAt).run();

  return Response.json({ ok: true, id, version: createdAt, createdAt }, { status: 201 });
}

async function updateCategory(payload: SettingsPayload) {
  const id = text(payload.id);
  const expectedVersion = text(payload.expectedVersion);
  const name = text(payload.name);
  if (payload.type !== "category-update" || !id || !expectedVersion || !name) {
    return Response.json({ error: "카테고리 이름을 입력해주세요." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const update = await runtimeEnv.DB.prepare(`
    UPDATE categories
    SET name = ?, rail_label = ?, updated_at = ?
    WHERE id = ? AND updated_at = ? AND active = 1
  `).bind(name, name, updatedAt, id, expectedVersion).run();
  if (update.meta.changes) return Response.json({ ok: true, version: updatedAt, updatedAt });

  const existing = await runtimeEnv.DB.prepare("SELECT id FROM categories WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) return Response.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
  return versionConflictResponse();
}

async function removeCategory(payload: SettingsPayload) {
  const id = text(payload.id);
  const expectedVersion = text(payload.expectedVersion);
  if (payload.type !== "category-delete" || !id || !expectedVersion) {
    return Response.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 400 });
  }

  const category = await runtimeEnv.DB.prepare("SELECT id, name, updated_at FROM categories WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; updated_at: string }>();
  if (!category) return Response.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
  if (category.updated_at !== expectedVersion) return versionConflictResponse();

  const products = await runtimeEnv.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE category = ?")
    .bind(category.name)
    .first<CountRow>();
  if (Number(products?.count ?? 0) > 0) {
    return Response.json(
      { error: `이 카테고리에는 상품 ${products?.count ?? 0}개가 있어 삭제할 수 없습니다. 상품을 이동하거나 삭제한 뒤 다시 시도해주세요.` },
      { status: 409 },
    );
  }

  const removal = await runtimeEnv.DB.prepare("DELETE FROM categories WHERE id = ? AND updated_at = ?")
    .bind(id, expectedVersion)
    .run();
  if (!removal.meta.changes) return versionConflictResponse();
  return Response.json({ ok: true });
}

export async function GET() {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const today = todayInSeoul();
    const [revisions, inactiveProducts, categories] = await Promise.all([
      runtimeEnv.DB.prepare(`
        SELECT id, active, sort_order, updated_at
        FROM products
        WHERE active IN (0, 1)
        ORDER BY sort_order, id
      `).all<ProductRevisionRow>(),
      runtimeEnv.DB.prepare(`
        SELECT
          p.id, p.category, p.name, p.subtitle, p.description, p.price,
          p.display_weight, p.image_url, p.badge, p.daily_limit, p.sort_order,
          p.active, p.updated_at, COALESCE(SUM(w.quantity), 0) AS reserved_quantity
        FROM products p
        LEFT JOIN work_items w
          ON w.product_id = p.id
          AND date(w.due_at) = ?
          AND w.work_status != 'cancelled'
        WHERE p.active = 0
        GROUP BY p.id
        ORDER BY p.sort_order, p.id
      `).bind(today).all<InactiveProductRow>(),
      runtimeEnv.DB.prepare(`
        SELECT c.id, c.name, c.sort_order, c.updated_at, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON p.category = c.name
        WHERE c.active = 1
        GROUP BY c.id
        ORDER BY c.sort_order, c.name COLLATE NOCASE
      `).all<CategoryRow>(),
    ]);

    return Response.json(
      {
        productRevisions: revisions.results.map((row) => ({
          id: row.id,
          active: Boolean(row.active),
          sortOrder: row.sort_order,
          version: row.updated_at,
        })),
        inactiveProducts: inactiveProducts.results.map(inactiveProduct),
        categories: categories.results.map((row) => ({
          id: row.id,
          name: row.name,
          sortOrder: row.sort_order,
          version: row.updated_at,
          productCount: row.product_count,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "상품 수정 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json().catch(() => null) as SettingsPayload | null;
    if (!payload || typeof payload !== "object") return invalidProductResponse();
    return createProduct(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "상품을 추가하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json().catch(() => null) as SettingsPayload | null;
    if (!payload || typeof payload !== "object") return invalidProductResponse();

    if (payload.type === "product") return updateProduct(payload);
    if (payload.type === "product-bulk") return bulkUpdateProducts(payload);
    if (payload.type === "product-reorder") return reorderProducts(payload);
    if (payload.type === "product-delete") return removeProduct(payload);
    if (payload.type === "category-create") return createCategory(payload);
    if (payload.type === "category-update") return updateCategory(payload);
    if (payload.type === "category-delete") return removeCategory(payload);

    return Response.json({ error: "요청 종류를 확인해주세요." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE constraint failed: categories.name")
      ? "같은 이름의 카테고리가 이미 있습니다."
      : error instanceof Error
        ? error.message
        : "상품 설정을 저장하지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
