import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareDeploy, restoredBindings } from "./prepare-build-deploy.mjs";

test("restores the IDs of existing D1, KV and R2 resources", () => {
  assert.deepEqual(
    restoredBindings([
      { name: "db", type: "d1", id: "existing-d1" },
      { name: "kv", type: "kv_namespace", namespace_id: "existing-kv" },
      { name: "r2", type: "r2_bucket", bucket_name: "existing-r2" },
      { name: "email", type: "send_email" },
    ]),
    {
      d1_databases: [{ binding: "db", database_name: "cloud-mail", database_id: "existing-d1" }],
      kv_namespaces: [{ binding: "kv", id: "existing-kv" }],
      r2_buckets: [{ binding: "r2", bucket_name: "existing-r2" }],
      send_email: [{ name: "email" }],
    },
  );
});

test("refuses to deploy without an earlier D1 or KV binding", () => {
  assert.throws(() => restoredBindings([{ name: "kv", type: "kv_namespace", namespace_id: "existing-kv" }]), /D1 binding/);
  assert.throws(() => restoredBindings([{ name: "db", type: "d1", id: "existing-d1" }]), /kv namespace/);
});

test("refuses to discard an unrecognized binding type", () => {
  assert.throws(() => restoredBindings([
    { name: "db", type: "d1", id: "existing-d1" },
    { name: "kv", type: "kv_namespace", namespace_id: "existing-kv" },
    { name: "other", type: "service" },
  ]), /Unrecognized existing binding/);
});

test("reads the old Worker version and redirects Wrangler to its existing resource IDs", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "cloud-mail-deploy-"));
  const paths = [];
  const fetcher = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    const result = path.endsWith("/accounts")
      ? [{ id: "account-id" }]
      : path.endsWith("/versions")
        ? { items: [{ id: "broken" }, { id: "old-good" }] }
        : path.endsWith("/broken")
          ? { resources: { bindings: [{ name: "assets", type: "assets" }] } }
          : { resources: { bindings: {
              db: { type: "d1", id: "original-d1" },
              kv: { type: "kv_namespace", namespace_id: "original-kv" },
              r2: { type: "r2_bucket", bucket_name: "original-r2" },
              domain: { type: "plain_text", text: '["example.com"]' },
            } } };
    return { ok: true, status: 200, json: async () => ({ success: true, result }) };
  };
  try {
    await prepareDeploy({ token: "test-token", workerName: "cloud-mail", fetcher, rootDir });
    const config = JSON.parse(await readFile(join(rootDir, "wrangler-bindings.generated.json"), "utf8"));
    const redirect = JSON.parse(await readFile(join(rootDir, ".wrangler", "deploy", "config.json"), "utf8"));
    assert.equal(config.d1_databases[0].database_id, "original-d1");
    assert.equal(config.kv_namespaces[0].id, "original-kv");
    assert.equal(config.r2_buckets[0].bucket_name, "original-r2");
    assert.equal(config.keep_vars, true);
    assert.equal(config.main, "src/index.ts");
    assert.equal(redirect.configPath, "../../wrangler-bindings.generated.json");
    assert.equal(paths.length, 4);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
