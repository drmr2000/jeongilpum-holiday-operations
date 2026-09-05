import { env } from "cloudflare:workers";
import { buildPackageCode } from "../../../../lib/package-domain";
import { OPERATOR_ACTOR, requireOperatorApi } from "../../../../lib/operator-session";

type Payload = {
  workItemId?: string;
  assemblyKey?: string;
};
type WorkItemRow = {
  id: string;
  order_id: string;
  order_no: string;
  product_id: string;
  product_name_snapshot: string;
  code: string;
};
type ExistingPackage = {
  id: string;
  package_code: string;
};

const runtimeEnv = env as typeof env & { DB: D1Database };

export async function POST(request: Request) {
  const denied = await requireOperatorApi();
  if (denied) return denied;

  try {
    const payload = await request.json() as Payload;
    const workItemId = payload.workItemId?.trim() ?? "";
    const assemblyKey = payload.assemblyKey?.trim() ?? "";
    if (!workItemId || !assemblyKey) {
      return Response.json({ error: "작업 항목과 중복방지 키를 확인해주세요." }, { status: 400 });
    }
    const prior = await runtimeEnv.DB.prepare(`
      SELECT id,package_code
      FROM packages
      WHERE assembly_key=?
    `).bind(assemblyKey).first<ExistingPackage>();
    if (prior) return Response.json({ ok: true, packageId: prior.id, packageCode: prior.package_code, alreadyApplied: true });

    const workItem = await runtimeEnv.DB.prepare(`
      SELECT
        w.id,w.order_id,o.order_no,w.product_id,w.product_name_snapshot,p.code
      FROM work_items w
      JOIN orders o ON o.id=w.order_id
      JOIN products p ON p.id=w.product_id
      WHERE w.id=?
    `).bind(workItemId).first<WorkItemRow>();
    if (!workItem) return Response.json({ error: "작업 항목을 찾을 수 없습니다." }, { status: 404 });

    const next = await runtimeEnv.DB.prepare(`
      SELECT COALESCE(MAX(package_sequence),0)+1 AS sequence
      FROM packages
      WHERE work_item_id=?
    `).bind(workItem.id).first<{ sequence: number }>();
    const sequence = Number(next?.sequence ?? 1);
    const packageId = crypto.randomUUID();
    const packageCode = buildPackageCode(workItem.code, workItem.order_no, workItem.order_id, sequence);
    const now = new Date().toISOString();

    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`
        INSERT INTO packages(
          id,work_item_id,package_sequence,assembly_key,package_code,product_id,
          product_name_snapshot,package_status,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,'queued',?,?)
      `).bind(
        packageId,
        workItem.id,
        sequence,
        assemblyKey,
        packageCode,
        workItem.product_id,
        workItem.product_name_snapshot,
        now,
        now,
      ),
      runtimeEnv.DB.prepare(`
        INSERT INTO work_item_events(
          id,work_item_id,order_id,event_type,from_value,to_value,actor,created_at
        ) VALUES(?,?,?,? ,NULL,?,?,?)
      `).bind(
        crypto.randomUUID(),
        workItem.id,
        workItem.order_id,
        `package_created:${assemblyKey}`,
        JSON.stringify({ packageId, packageCode }),
        OPERATOR_ACTOR,
        now,
      ),
    ]);

    return Response.json({
      ok: true,
      packageId,
      packageCode,
      qrValue: `/workshop/packages/${encodeURIComponent(packageCode)}`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "패키지를 생성하지 못했습니다." },
      { status: 400 },
    );
  }
}
