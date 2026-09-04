import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function routeFiles(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const childPath = `${path}/${entry.name}`;
    if (entry.isDirectory()) return routeFiles(childPath);
    return entry.name === "route.ts" ? [childPath] : [];
  }));
  return files.flat();
}

test("work status updates are isolated to the shared transition gateway", async () => {
  const [files, transitionSource] = await Promise.all([
    routeFiles("app/api"),
    readFile(new URL("app/lib/work-status.ts", root), "utf8"),
  ]);
  const routeSources = await Promise.all(files.map((path) => readFile(new URL(path, root), "utf8")));
  for (const source of routeSources) {
    assert.doesNotMatch(source, /UPDATE\s+work_items\s+SET[\s\S]{0,500}work_status\s*=/i);
  }
  assert.match(transitionSource, /function prepareWorkStatusTransition/);
  assert.match(transitionSource, /SET work_status=\?,version=version\+1,updated_at=\?/);
});
