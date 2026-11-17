// Blog cards are server-rendered with [data-enter], so their fade-in plays on a full page load
// without waiting for JS. On a client-side navigation the view transition already animates the
// page, so strip the attribute from the incoming document before it is swapped in. Must be
// imported on the page you navigate *from*, since that's where the listener runs.
document.addEventListener('astro:before-swap', (event) => {
	for (const el of event.newDocument.querySelectorAll('[data-enter]')) el.removeAttribute('data-enter');
});
