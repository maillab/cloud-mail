// Preserve the D1-backed KV format used by the existing production deployment.
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function toBytes(value) {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer());
}
var D1KV = class {
  constructor(db) {
    this.db = db;
  }
  async put(key, value, options = {}) {
    const bytes = await toBytes(value);
    const expiration = options.expiration ?? (options.expirationTtl ? Math.floor(Date.now() / 1e3) + Number(options.expirationTtl) : null);
    await this.db.prepare(`INSERT INTO kv_store (key, value, metadata, expires_at)
			VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET
			value = excluded.value, metadata = excluded.metadata, expires_at = excluded.expires_at`).bind(key, encodeBase64(bytes), options.metadata ? JSON.stringify(options.metadata) : null, expiration).run();
  }
  async getWithMetadata(key, options = {}) {
    const row = await this.db.prepare(`SELECT value, metadata FROM kv_store
			WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`).bind(key, Math.floor(Date.now() / 1e3)).first();
    if (!row) return { value: null, metadata: null };
    const bytes = decodeBase64(row.value);
    const type = typeof options === "string" ? options : options.type;
    let value;
    if (type === "arrayBuffer") value = bytes.buffer;
    else if (type === "json") value = JSON.parse(decoder.decode(bytes));
    else value = decoder.decode(bytes);
    return { value, metadata: row.metadata ? JSON.parse(row.metadata) : null };
  }
  async get(key, options = {}) {
    return (await this.getWithMetadata(key, options)).value;
  }
  async delete(key) {
    await this.db.prepare("DELETE FROM kv_store WHERE key = ?").bind(key).run();
  }
  async list(options = {}) {
    const prefix = options.prefix || "";
    const rows = await this.db.prepare(`SELECT key, metadata FROM kv_store
			WHERE key LIKE ? ESCAPE '\\' AND (expires_at IS NULL OR expires_at > ?)
			ORDER BY key LIMIT ?`).bind(prefix.replace(/[\\%_]/g, "\\$&") + "%", Math.floor(Date.now() / 1e3), Math.min(options.limit || 1e3, 1e3)).all();
    return { keys: (rows.results || []).map((row) => ({ name: row.key, metadata: row.metadata ? JSON.parse(row.metadata) : null })), list_complete: true, cursor: "" };
  }
};


export function withStorage(env) {
  return env.kv ? env : { ...env, kv: new D1KV(env.db) };
}
