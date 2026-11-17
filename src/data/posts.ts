export interface Post {
	slug: string;
	title: string;
	tag: string;
	summary: string;
	status: 'published' | 'queued';
	date?: Date;
	minutes?: number; // set manually
}

export const posts: Post[] = [
	{
		slug: 'aether-ml',
		title: 'Building Aether-ML with agents',
		tag: 'AETHER-ML',
		summary: "An agent and I argue out the plan, I make the calls, and nothing lands until I've read the diff.",
		status: 'published',
		date: new Date('2026-11-04'),
		minutes: 5,
	},
	{
		slug: 'sift',
		title: 'Learning Sift in teach mode',
		tag: 'SIFT',
		summary: 'On Sift the roles flip: I write every line, and the agent is only allowed to teach.',
		status: 'queued',
	},
];

function postNumber(index: number) {
	return String(index + 1).padStart(2, '0');
}

export function getPost(slug: string) {
	const index = posts.findIndex((post) => post.slug === slug);
	if (index === -1) throw new Error(`Unknown post: ${slug}`);
	return { post: posts[index], number: postNumber(index) };
}

export function getNextPost(slug: string) {
	const index = posts.findIndex((post) => post.slug === slug);
	if (index === -1) throw new Error(`Unknown post: ${slug}`);
	const next = posts[index + 1];
	return { next: next && { post: next, number: postNumber(index + 1) } };
}

/** "NOV 04 2026" */
export function formatDate(date: Date) {
	return date
		.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
		.replace(',', '')
		.toUpperCase();
}

/** Shared view-transition names, so a card morphs into its post header. */
export function transitionNames(slug: string) {
	return { frame: `post-${slug}`, number: `post-${slug}-number` };
}
