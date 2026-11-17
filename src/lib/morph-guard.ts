// The card -> post header morph only reads well when both ends are on screen. If either end is
// off screen at navigation time, drop the shared names and let the page crossfade instead.
// Must be imported on the page you navigate *from*, since that's where the listeners run.

const NAMED = '[style*="view-transition-name: post-"]';

const offScreen = (el: Element) => {
	const rect = el.getBoundingClientRect();
	return rect.bottom <= 0 || rect.top >= innerHeight;
};
const anyOffScreen = () => [...document.querySelectorAll(NAMED)].some(offScreen);
/** Drops the names and returns a function that puts them back, for the next navigation. */
const unname = (root: ParentNode) => {
	const saved = [...root.querySelectorAll<HTMLElement>(NAMED)].map((el) => {
		const name = el.style.getPropertyValue('view-transition-name');
		el.style.removeProperty('view-transition-name');
		return () => el.style.setProperty('view-transition-name', name);
	});
	return () => saved.forEach((restore) => restore());
};

let skipped = false;
let transition: ViewTransition | undefined;

document.addEventListener('astro:before-preparation', (event) => {
	const load = event.loader;
	// Measure after loading, right before the old page is captured, in case the reader scrolled meanwhile.
	event.loader = async () => {
		await load();
		skipped = anyOffScreen();
		// The old page is discarded after the swap, so these never need restoring.
		if (skipped) unname(document);
	};
});

document.addEventListener('astro:before-swap', (event) => {
	transition = event.viewTransition;
	if (skipped) transition.finished.finally(unname(event.newDocument));
});

// Back/forward restores scroll, so the incoming end can land off screen too. The old end is already
// captured with its names: it can only fade out in place, so hide the travelling outline as well.
document.addEventListener('astro:after-swap', () => {
	if (skipped || !anyOffScreen()) return;
	const restore = unname(document);
	const root = document.documentElement;
	root.dataset.morphSkipped = '';
	transition?.finished.finally(() => {
		restore();
		delete root.dataset.morphSkipped;
	});
});
