import {
	siAmd,
	siAstro,
	siDocker,
	siGithubactions,
	siJavascript,
	siNumpy,
	siNvidia,
	siOpenjdk,
	siPandas,
	siPytorch,
	siTailwindcss,
	siTensorflow,
	siTypescript,
} from 'simple-icons';
import { customIcons } from './icons/custom';

/* `body` is the inner markup of the <svg>, so single-path Simple Icons and
   hand-added multi-path logos render through the same component. */
export type Icon = { viewBox: string; body: string; hex: string };
export type Tech = { name: string; icon?: Icon };

/* Simple Icons is a build-time dependency: only the markup below reaches the
   browser. `name` overrides the icon's own title where they differ; `hex`
   overrides brand colours that fall below ~2.5:1 contrast on --color-bg, using
   another colour from the same project's palette. */
const si = (
	{ title, path, hex }: { title: string; path: string; hex: string },
	{ name = title, color = `#${hex}` }: { name?: string; color?: string } = {},
): Tech => ({
	name,
	icon: { viewBox: '0 0 24 24', body: `<path d="${path}"/>`, hex: color },
});

export const tech = {
	python: { name: 'Python', icon: customIcons.python },
	javascript: si(siJavascript),
	typescript: si(siTypescript),
	java: si(siOpenjdk, { name: 'Java', color: '#E76F00' }),
	cpp: { name: 'C++', icon: customIcons.cpp },
	tensorflow: si(siTensorflow),
	pytorch: si(siPytorch),
	numpy: si(siNumpy, { color: '#4DABCF' }),
	cupy: { name: 'CuPy', icon: customIcons.cupy },
	/* No icon exists for the compute stacks themselves, so these carry the
	   vendor's logo with the stack as the label. */
	cuda: si(siNvidia, { name: 'CUDA' }),
	rocm: si(siAmd, { name: 'ROCm' }),
	pandas: si(siPandas, { color: '#E70488' }),
	astro: si(siAstro),
	tailwind: si(siTailwindcss, { name: 'Tailwind CSS' }),
	docker: si(siDocker),
	githubActions: si(siGithubactions, { name: 'GitHub Actions' }),
} satisfies Record<string, Tech>;

export type TechKey = keyof typeof tech;
