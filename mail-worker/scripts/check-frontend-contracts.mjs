import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
const backend = new Set();
for (const file of walk(resolve(workerRoot, 'src/api')).filter(file => /\.[jt]s$/.test(file))) {
	for (const match of readFileSync(file, 'utf8').matchAll(/\bapp\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]/g)) backend.add(`${match[1].toUpperCase()} ${match[2]}`);
}
const routes = node => {
	if (ts.isStringLiteral(node)) return [node.text];
	if (ts.isConditionalExpression(node)) return [...routes(node.whenTrue), ...routes(node.whenFalse)];
	if (ts.isTemplateExpression(node) && node.head.text === '/oauth/') return ['linuxDo', 'github', 'google'].map(provider => `/oauth/${provider}/login`);
	return [];
};
const frontend = new Set();
for (const file of walk(resolve(workerRoot, '../mail-react/src/api')).filter(file => file.endsWith('.ts'))) {
	const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const visit = node => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['get', 'post', 'put', 'del'].includes(node.expression.text)) {
			for (const route of routes(node.arguments[0])) frontend.add(`${node.expression.text === 'del' ? 'DELETE' : node.expression.text.toUpperCase()} ${route.split('?')[0]}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
}
const missing = [...frontend].filter(route => !backend.has(route));
if (!frontend.size || missing.length) throw new Error(`Frontend API mapping failed: ${missing.join(', ') || 'no endpoints found'}`);
console.log(`All ${frontend.size} frontend endpoint/method mappings exist among ${backend.size} Worker routes; frontend source was only read.`);
