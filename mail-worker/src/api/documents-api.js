import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import r2Service from '../service/r2-service';
import permService from '../service/perm-service';

// Documents are a company-shared library. Any member with documents:query can
// browse and download every file; only the uploader (owner) or a member holding
// documents:delete may remove a file. Folders are shared and visible to all.
// The security middleware already gates /documents by the documents:* perms.

async function keys(c, userId) {
  return permService.userPermKeys(c, userId);
}

function canDelete(permKeys, row, userId) {
  if (permKeys.includes('documents:delete') || permKeys.includes('*')) return true;
  return Number(row.user_id) === Number(userId);
}

app.get('/documents/folders', async (c) => {
  const { results } = await c.env.db.prepare(
    `SELECT id, user_id, name, parent_id, create_time FROM document_folders WHERE is_del = 0 ORDER BY name ASC`
  ).all();
  return c.json(result.ok({ list: results }));
});

app.post('/documents/folders', async (c) => {
  const userId = userContext.getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const { name, parent_id } = body;

  const { meta } = await c.env.db.prepare(
    `INSERT INTO document_folders (user_id, name, parent_id, create_time) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(userId, name ?? '', parent_id ?? null).run();

  return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/documents/folders/:id', async (c) => {
  const userId = userContext.getUserId(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  // Renaming a shared folder is allowed for its creator or anyone with edit.
  const permKeys = await keys(c, userId);
  const folder = await c.env.db.prepare(
    `SELECT user_id FROM document_folders WHERE id = ? AND is_del = 0`
  ).bind(id).first();
  if (!folder) return c.json(result.fail('Folder not found.', 404), 404);
  if (!permKeys.includes('documents:edit') && !permKeys.includes('*') && Number(folder.user_id) !== Number(userId)) {
    return c.json(result.fail('Not allowed.', 403), 403);
  }

  await c.env.db.prepare(
    `UPDATE document_folders SET name = COALESCE(?, name), parent_id = COALESCE(?, parent_id) WHERE id = ? AND is_del = 0`
  ).bind(body.name ?? null, body.parent_id ?? null, id).run();

  return c.json(result.ok());
});

app.delete('/documents/folders/:id', async (c) => {
  const userId = userContext.getUserId(c);
  const id = c.req.param('id');
  const permKeys = await keys(c, userId);
  const folder = await c.env.db.prepare(
    `SELECT user_id FROM document_folders WHERE id = ? AND is_del = 0`
  ).bind(id).first();
  if (!folder) return c.json(result.ok());
  if (!permKeys.includes('documents:delete') && !permKeys.includes('*') && Number(folder.user_id) !== Number(userId)) {
    return c.json(result.fail('Not allowed.', 403), 403);
  }

  await c.env.db.prepare(`UPDATE document_folders SET is_del = 1 WHERE id = ?`).bind(id).run();

  return c.json(result.ok());
});

app.get('/documents', async (c) => {
  const userId = userContext.getUserId(c);
  const { folder_id, search } = c.req.query();

  // Company-shared: every non-deleted document is visible to any member with
  // documents:query. The owner is returned so the UI can show who uploaded it
  // and gate the delete action.
  let sql = `SELECT d.id, d.user_id, d.folder_id, d.name, d.storage_key, d.content_type,
                    d.size_bytes, d.create_time, d.update_time, u.display_name AS owner_name
             FROM documents d
             LEFT JOIN user u ON u.user_id = d.user_id
             WHERE d.is_del = 0`;
  const params = [];

  if (folder_id !== undefined && folder_id !== '') {
    sql += ` AND d.folder_id = ?`;
    params.push(Number(folder_id));
  }
  if (search) {
    sql += ` AND d.name LIKE ?`;
    params.push(`%${search}%`);
  }

  sql += ` ORDER BY d.create_time DESC LIMIT 200`;

  const { results } = await c.env.db.prepare(sql).bind(...params).all();

  // Tell the client which rows it may delete.
  const permKeys = await keys(c, userId);
  const list = results.map(row => ({
    ...row,
    can_delete: canDelete(permKeys, row, userId)
  }));

  return c.json(result.ok({ list, total: list.length }));
});

app.post('/documents/upload', async (c) => {
  const userId = userContext.getUserId(c);
  const formData = await c.req.formData();
  const file = formData.get('file');
  const folderId = formData.get('folder_id');

  if (!file || typeof file.arrayBuffer !== 'function') {
    return c.json(result.fail('No file provided.', 400), 400);
  }

  const name = file.name || 'file';
  const buffer = await file.arrayBuffer();
  const contentType = file.type || 'application/octet-stream';
  const storageKey = `documents/${userId}/${folderId ?? 0}/${Date.now()}-${name}`;

  await r2Service.putObj(c, storageKey, buffer, { contentType });

  const { meta } = await c.env.db.prepare(
    `INSERT INTO documents (user_id, folder_id, name, storage_key, content_type, size_bytes, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(userId, folderId ? Number(folderId) : null, name, storageKey, contentType, buffer.byteLength).run();

  return c.json(result.ok({ id: meta.last_row_id, name, size_bytes: buffer.byteLength }));
});

app.get('/documents/:id/download', async (c) => {
  const id = c.req.param('id');

  // Shared library: any member with documents:query may download.
  const row = await c.env.db.prepare(
    `SELECT storage_key, name, content_type FROM documents WHERE id = ? AND is_del = 0`
  ).bind(id).first();

  if (!row) {
    return c.json(result.fail('Document not found.', 404), 404);
  }

  const resp = await r2Service.toObjResp(c, row.storage_key);
  if (!resp) {
    return c.notFound();
  }

  resp.headers.set('Content-Disposition', `attachment; filename="${row.name}"`);
  return resp;
});

app.delete('/documents/:id', async (c) => {
  const userId = userContext.getUserId(c);
  const id = c.req.param('id');
  const permKeys = await keys(c, userId);

  const row = await c.env.db.prepare(
    `SELECT user_id, storage_key FROM documents WHERE id = ? AND is_del = 0`
  ).bind(id).first();

  if (!row) {
    return c.json(result.ok());
  }

  // Only the owner or a member with documents:delete may remove a file.
  if (!canDelete(permKeys, row, userId)) {
    return c.json(result.fail('You can only delete your own documents.', 403), 403);
  }

  if (row.storage_key) {
    await r2Service.delete(c, row.storage_key);
  }

  await c.env.db.prepare(`UPDATE documents SET is_del = 1 WHERE id = ?`).bind(id).run();

  return c.json(result.ok());
});