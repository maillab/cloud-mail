// Runtime smoke test for the Batch 2 shell files. Renders each component through
// Vite's SSR pipeline with pinia + router + i18n installed, so setup-time
// ReferenceErrors (the missing usePresence import) surface as real exceptions.
const doc = {
	documentElement: { classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {}, setAttribute() {}, getAttribute: () => null },
	body: { classList: { add() {}, remove() {} }, appendChild() {}, style: {} },
	head: { appendChild() {} },
	createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} }),
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	addEventListener() {},
	removeEventListener() {},
	createTextNode: () => ({}),
	createComment: () => ({})
};
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.location = { href: 'http://127.0.0.1:3001/', pathname: '/', search: '', hash: '', origin: 'http://127.0.0.1:3001' };
globalThis.history = { state: {}, replaceState() {}, pushState() {}, back() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', language: 'en' }, configurable: true }); } catch {}
globalThis.localStorage = {
	store: { token: 'test-token' },
	getItem(k) { return this.store[k] ?? null; },
	setItem(k, v) { this.store[k] = v; },
	removeItem(k) { delete this.store[k]; }
};
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.scrollTo = () => {};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
	const url = typeof input === 'string' ? input : input.url;
	const absolute = url.startsWith('http') ? url : 'http://127.0.0.1:8787' + (url.startsWith('/api') ? url : '/api' + url);
	return realFetch(absolute, init);
};

const { createServer } = await import('vite');
const { createSSRApp, h } = await import('vue');
const { renderToString } = await import('vue/server-renderer');
const { createRouter, createMemoryHistory } = await import('vue-router');

const server = await createServer({
	root: 'C:/Users/Rodney/Documents/XPass-Development/cloud-mail/mail-vue',
	configFile: 'C:/Users/Rodney/Documents/XPass-Development/cloud-mail/mail-vue/vite.config.js',
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error',
	ssr: { noExternal: ['element-plus', '@element-plus/icons-vue'] }
});

const targets = [
	'/src/components/hq-avatar/index.vue',
	'/src/layout/header/index.vue',
	'/src/layout/aside/index.vue',
	'/src/views/people/index.vue',
	'/src/views/requests/index.vue',
	'/src/views/setting/index.vue'
];

let failed = 0;
for (const target of targets) {
	try {
		const mod = await server.ssrLoadModule(target);
		const Comp = mod.default;
		const { createPinia } = await import('pinia');
		const { default: i18n } = await server.ssrLoadModule('/src/i18n/index.js');
		const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'overview', component: { render: () => null } }] });
		const app = createSSRApp({ render: () => h(Comp) });
		await router.push('/');
		await router.isReady();
		app.use(createPinia()).use(router).use(i18n);
		const errors = [];
		app.config.errorHandler = (err) => errors.push(String((err && err.stack) || err).split('\n').slice(0, 4).join(' | '));
		const html = await renderToString(app);
		const ok = html.length > 0;
		if (!ok) failed++;
		console.log(`${ok ? 'RENDER OK' : 'EMPTY'} ${target} html=${html.length}${errors.length ? ' errors=' + errors[0] : ''}`);
	} catch (e) {
		failed++;
		const msg = String((e && e.message) || e);
		console.log(`RENDER FAIL ${target} :: ${msg.split('\n')[0]}`);
	}
}
console.log(failed ? `${failed} component(s) failed` : 'all components rendered');
await server.close();
process.exit(0);