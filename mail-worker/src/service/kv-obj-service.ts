import type { EnvContext } from '../types/context';
import type { ObjectContent, ObjectMetadata } from '../types/attachment';

const kvObjService = {
	async putObj(c: EnvContext, key: string, content: ObjectContent, metadata: ObjectMetadata): Promise<void> {
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c: EnvContext, keys: string | string[]): Promise<void> {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async getObj(c: EnvContext, key: string): Promise<Response | null> {
		const obj = await c.env.kv.getWithMetadata<ObjectMetadata>(key, { type: 'arrayBuffer' });
		if (!obj.value) {
			return null;
		}

		const headers = new Headers({
			'Content-Type': obj.metadata?.contentType || 'application/octet-stream',
			'Content-Length': String(obj.value.byteLength),
		});
		if (obj.metadata?.contentDisposition) headers.set('Content-Disposition', obj.metadata.contentDisposition);
		if (obj.metadata?.cacheControl) headers.set('Cache-Control', obj.metadata.cacheControl);
		return new Response(obj.value, { headers });
	},

	async toObjResp(c: EnvContext, key: string, request?: Request): Promise<Response> {
		if (request && !['GET', 'HEAD'].includes(request.method)) {
			return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
		}
		const response = await this.getObj(c, key);
		if (!response) return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
		return request?.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;

	}

};

export default kvObjService;
