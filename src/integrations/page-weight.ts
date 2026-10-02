import type { AstroIntegration } from "astro";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import { brotliCompressSync } from "node:zlib";

const PLACEHOLDER = "__PAGE_WEIGHT__";
const LINK_TAG = /<link\b[^>]*>/g;
const PRELOADED_REL = /\brel="(?:stylesheet|preload|modulepreload)"/;
const LOCAL_HREF = /\bhref="(\/(?!\/)[^"]*)"/;
const LOCAL_SCRIPT_SRC = /<script\b[^>]*\bsrc="(\/(?!\/)[^"]*)"/g;
// Minified static imports between chunks, e.g. `from"./renderer.js"` or `import"./side-effect.js"`.
const STATIC_IMPORT = /\b(?:from|import)\s*"(\.{1,2}\/[^"]+)"/g;

type Asset = { size: number; imports: string[] };

// Patches each page's footer with the Brotli size of its HTML plus the CSS/JS/fonts it loads
// (including JS chunks pulled in by static imports). Runs after the build because the number
// can't be known while the footer renders.
export default function pageWeight(): AstroIntegration {
	return {
		name: "page-weight",
		hooks: {
			"astro:build:done": async ({ dir }) => {
				const assets = new Map<string, Promise<Asset>>();
				const loadAsset = async (path: string): Promise<Asset> => {
					const bytes = await readFile(new URL(`.${path}`, dir));
					const imports = path.endsWith(".js")
						? [...bytes.toString("utf8").matchAll(STATIC_IMPORT)].map((m) => posix.join(posix.dirname(path), m[1]))
						: [];
					return { size: brotliCompressSync(bytes).length, imports };
				};
				const getAsset = (path: string) => {
					if (!assets.has(path)) assets.set(path, loadAsset(path));
					return assets.get(path)!;
				};

				const files = await readdir(dir, { recursive: true });
				for (const file of files.filter((f) => f.endsWith(".html"))) {
					const url = new URL(file, dir);
					const html = await readFile(url, "utf8");
					if (!html.includes(PLACEHOLDER)) continue;

					const links = [...html.matchAll(LINK_TAG)]
						.filter(([tag]) => PRELOADED_REL.test(tag))
						.map(([tag]) => tag.match(LOCAL_HREF)?.[1]);
					const scripts = [...html.matchAll(LOCAL_SCRIPT_SRC)].map((m) => m[1]);
					// A Set iterates entries added during the loop, so this walks the import graph once per page.
					const loaded = new Set([...links, ...scripts].filter((p) => p !== undefined));

					let bytes = brotliCompressSync(html).length;
					for (const path of loaded) {
						const { size, imports } = await getAsset(path);
						bytes += size;
						imports.forEach((p) => loaded.add(p));
					}
					await writeFile(url, html.replaceAll(PLACEHOLDER, `${(bytes / 1000).toFixed(1)} kB`));
				}
			},
		},
	};
}
