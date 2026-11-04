import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = "https://api.cloudflare.com/client/v4";

export function restoredBindings(bindings) {
  const rows = Array.isArray(bindings)
    ? bindings
    : Object.entries(bindings || {}).map(([name, binding]) => ({ name, ...binding }));
  const find = (name, type) => rows.find((item) => item?.name === name && item.type === type);
  const d1 = find("db", "d1");
  const kv = find("kv", "kv_namespace");
  if (!d1?.id && !d1?.database_id) throw new Error("The earlier Worker version has no db D1 binding");
  if (!kv?.namespace_id) throw new Error("The earlier Worker version has no kv namespace binding");
  const known = new Set(["d1", "kv_namespace", "r2_bucket", "ai", "assets", "send_email", "plain_text", "secret_text", "secret_key"]);
  for (const item of rows) {
    if (!known.has(item.type)) throw new Error(`Unrecognized existing binding type: ${item.type}`);
  }
  const r2 = find("r2", "r2_bucket");
  const email = find("email", "send_email");
  return {
    d1_databases: [{ binding: "db", database_name: "cloud-mail", database_id: d1.database_id || d1.id }],
    kv_namespaces: [{ binding: "kv", id: kv.namespace_id }],
    ...(r2 ? { r2_buckets: [{ binding: "r2", bucket_name: r2.bucket_name }] } : {}),
    ...(email ? { send_email: [{ name: "email" }] } : {}),
  };
}

export async function prepareDeploy({ token, accountId, workerName, fetcher = fetch, rootDir = root }) {
  if (!token || !workerName) {
    throw new Error("Workers Builds must expose its Cloudflare API token and Worker name before deploying with existing bindings");
  }
  const request = async (path) => {
    const response = await fetcher(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(`Cloudflare binding lookup failed (${response.status}): ${body.errors?.map((e) => e.message).join(", ") || "unknown error"}`);
    return body.result;
  };
  if (!accountId) {
    const accounts = await request("/accounts?per_page=100");
    if (accounts.length !== 1) {
      throw new Error("More than one Cloudflare account is available; set CLOUDFLARE_ACCOUNT_ID in Workers Builds");
    }
    accountId = accounts[0].id;
  }
  const requestWorker = (path) => request(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}${path}`);
  const versions = await requestWorker("/versions?per_page=100");
  let bindings;
  for (const version of versions.items || []) {
    const detail = await requestWorker(`/versions/${encodeURIComponent(version.id)}`);
    try {
      bindings = restoredBindings(detail.resources?.bindings);
      break;
    } catch {
      // A recent broken deployment may have dropped bindings. Keep looking back.
    }
  }
  if (!bindings) throw new Error("No prior Worker version contains both original db and kv bindings; deployment stopped to protect existing data");
  const config = {
    name: workerName,
    main: "src/index.ts",
    compatibility_date: "2025-06-04",
    keep_vars: true,
    observability: { enabled: true },
    ai: { binding: "ai" },
    assets: { binding: "assets", directory: "./dist", not_found_handling: "single-page-application", run_worker_first: true },
    triggers: { crons: ["0 * * * *"] },
    ...bindings,
  };
  const deployDir = join(rootDir, ".wrangler", "deploy");
  await mkdir(deployDir, { recursive: true });
  await writeFile(join(rootDir, "wrangler-bindings.generated.json"), JSON.stringify(config, null, 2));
  await writeFile(join(deployDir, "config.json"), JSON.stringify({ configPath: "../../wrangler-bindings.generated.json" }));
  console.log("Restored existing Worker D1/KV/R2 bindings from Cloudflare version history for this deploy.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.WORKERS_CI === "1") {
    if (process.env.WORKERS_CI_BRANCH !== "frontend-react-rewrite") {
      throw new Error("Refusing to prepare production bindings for another branch");
    }
    await prepareDeploy({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      workerName: process.env.WRANGLER_CI_OVERRIDE_NAME || "cloud-mail",
    });
  }
}
