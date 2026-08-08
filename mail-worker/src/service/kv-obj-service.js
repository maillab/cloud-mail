const kvObjService = {
	async putObj(c, key, content, metadata = {}) {
		await c.env.kv.put(key, content, { metadata });
	},

	async deleteObj(c, keys) {
		const list = [...new Set((typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [])
			.map(item => String(item || '').trim()).filter(Boolean))];
		if (!list.length) return;
		await Promise.all(list.map(key => c.env.kv.delete(key)));
	},

	async getObj(c, key) {
		const obj = await c.env.kv.getWithMetadata(key, { type: 'arrayBuffer' });
		if (!obj.value) return null;
		const headers = new Headers({ 'Content-Type': obj.metadata?.contentType || 'application/octet-stream' });
		if (obj.metadata?.contentDisposition) headers.set('Content-Disposition', obj.metadata.contentDisposition);
		if (obj.metadata?.cacheControl) headers.set('Cache-Control', obj.metadata.cacheControl);
		return new Response(obj.value, { headers });
	},

	async toObjResp(c, key) { return this.getObj(c, key); }
};

export default kvObjService;
