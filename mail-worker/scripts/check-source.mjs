import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function sourceGraph(root = resolve(workerRoot, 'src')) {
	const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
	const files = walk(root).filter(path => /\.[jt]s$/.test(path) && !path.endsWith('.d.ts'));
	const graph = new Map(), problems = [];
	for (const file of files) {
		const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
		const edges = [];
		for (const node of source.statements) {
			if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
			if (node.importClause?.isTypeOnly) continue;
			const named = node.importClause?.namedBindings;
			if (named && ts.isNamedImports(named) && named.elements.length && named.elements.every(element => element.isTypeOnly) && !node.importClause.name) continue;
			const specifier = node.moduleSpecifier.text;
			if (specifier.startsWith('node:')) problems.push(`Node-only source import: ${relative(workerRoot, file)} -> ${specifier}`);
			if (!specifier.startsWith('.')) continue;
			const base = resolve(dirname(file), specifier), candidates = /\.[jt]s$/.test(base) ? [base] : [base + '.ts', base + '.js', resolve(base, 'index.ts')];
			const target = candidates.find(existsSync);
			if (!target) problems.push(`Missing import: ${relative(workerRoot, file)} -> ${specifier}`);
			else edges.push(target);
		}
		graph.set(file, edges);
		const visit = node => {
			if (node.kind === ts.SyntaxKind.AnyKeyword) problems.push(`Explicit any: ${relative(workerRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	const visiting = new Set(), visited = new Set(), cycles = [];
	const visit = (file, stack) => {
		if (visiting.has(file)) { cycles.push([...stack.slice(stack.indexOf(file)), file].map(path => relative(workerRoot, path).replaceAll('\\', '/'))); return; }
		if (visited.has(file)) return;
		visiting.add(file);
		for (const next of graph.get(file) || []) visit(next, [...stack, file]);
		visiting.delete(file); visited.add(file);
	};
	for (const file of graph.keys()) visit(file, []);
	return { files, graph, cycles, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const result = sourceGraph();
	const problems = [...result.problems, ...result.files.filter(file => file.endsWith('.js')).map(file => `Old JS implementation: ${relative(workerRoot, file)}`), ...result.cycles.map(cycle => `Runtime import cycle: ${cycle.join(' -> ')}`)];
	if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
	else console.log(`Checked ${result.files.length} TypeScript modules: imports resolve, no cycles, no explicit any or Node imports.`);
}
