import { build } from 'esbuild';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const extensions = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];
const registryKey = Symbol.for('cloud-mail.test-module-loader.mocks');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

function filePath(path) {
  if (path instanceof URL) return fileURLToPath(path);
  return isAbsolute(path) ? path : resolve(workerRoot, path);
}

function identity(path) {
  const normalized = normalize(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

// Resolve extensionless modules and reject ambiguous parallel implementations.
export async function resolveSourcePath(path) {
  const absolute = filePath(path);
  const extension = extname(absolute);
  if (extension && !extensions.includes(extension)) {
    if (await exists(absolute)) return absolute;
    throw new Error(`Test module does not exist: ${absolute}`);
  }
  const stem = extension ? absolute.slice(0, -extension.length) : absolute;
  const candidates = (await Promise.all(extensions.map(async suffix => {
    const candidate = stem + suffix;
    return await exists(candidate) ? candidate : null;
  }))).filter(Boolean);
  if (candidates.length > 1) {
    throw new Error(`Multiple test module implementations: ${candidates.join(', ')}`);
  }
  if (extension && !await exists(absolute)) throw new Error(`Test module does not exist: ${absolute}`);
  if (!candidates.length) throw new Error(`Test module does not exist: ${absolute}`);
  return candidates[0];
}

function mockModuleSource(id, exports) {
  const lines = [`const bindings = globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(registryKey))})].get(${JSON.stringify(id)});`];
  for (const [index, name] of Object.keys(exports).entries()) {
    if (name !== 'default' && !/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Invalid mocked export name: ${name}`);
    lines.push(`const binding${index} = bindings[${JSON.stringify(name)}];`);
    lines.push(`export { binding${index} as ${name} };`);
  }
  return lines.join('\n');
}

/**
 * Compile and import the real JS/TS dependency graph without changing its source.
 * Explicit dependency mocks are ESM export objects, keyed by a file URL/path or
 * a bare module specifier. Mocked object/function identity is retained at runtime.
 * Worker-only bindings should be isolated at their imports, never stripped out.
 */
export async function loadModule(entry, { mocks = new Map() } = {}) {
  const entryPoint = await resolveSourcePath(entry);
  const registry = globalThis[registryKey] ??= new Map();
  const files = new Map();
  const specifiers = new Map();
  const ids = [];
  let directory;

  try {
    for (const [path, exports] of mocks) {
      const id = randomUUID();
      registry.set(id, exports);
      ids.push(id);
      const record = { id, contents: mockModuleSource(id, exports) };
      if (typeof path === 'string' && !isAbsolute(path) && !path.startsWith('.') && !path.startsWith('src/') && !path.startsWith('src\\')) {
        specifiers.set(path, record);
      } else {
        files.set(identity(await resolveSourcePath(path)), record);
      }
    }

    const compiled = await build({
      absWorkingDir: workerRoot,
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['worker', 'browser'],
      target: 'es2022',
      sourcemap: 'inline',
      logLevel: 'silent',
      plugins: [{
        name: 'explicit-test-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, async args => {
            if (args.pluginData?.resolvingRealModule) return undefined;
            const direct = specifiers.get(args.path);
            if (direct) return { path: direct.id, namespace: 'test-dependency' };
            const resolved = await builder.resolve(args.path, {
              kind: args.kind,
              importer: args.importer,
              resolveDir: args.resolveDir,
              pluginData: { resolvingRealModule: true },
            });
            // Let esbuild itself handle unresolved optional require() calls:
            // dependencies such as linkedom intentionally catch missing canvas.
            // Turning that resolver result into a plugin error loses try/catch
            // semantics and would reject a graph that Wrangler can compile.
            if (resolved.errors.length) return undefined;
            const mock = files.get(identity(resolved.path));
            if (mock) return { path: mock.id, namespace: 'test-dependency' };
            // The recursion guard belongs only to builder.resolve(), not to
            // the loaded module and its own imports.
            const { pluginData, ...resolution } = resolved;
            return resolution;
          });
          builder.onLoad({ filter: /.*/, namespace: 'test-dependency' }, args => {
            const record = [...files.values(), ...specifiers.values()].find(mock => mock.id === args.path);
            return { contents: record.contents, loader: 'js' };
          });
        },
      }],
    });

    // A fresh file URL isolates singletons and keeps failure stacks readable;
    // embedding a full bundle in a data URL would print megabytes per failure.
    directory = await mkdtemp(join(tmpdir(), 'cloud-mail-test-module-'));
    const output = join(directory, 'module.mjs');
    await writeFile(output, compiled.outputFiles[0].text);
    return await import(pathToFileURL(output).href);
  } finally {
    for (const id of ids) registry.delete(id);
    if (!registry.size) delete globalThis[registryKey];
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
