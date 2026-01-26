declare module "rehype-slug" {
	import type { Plugin } from "unified";

	interface Options {
		prefix?: string;
	}

	const rehypeSlug: Plugin<[Options?]>;
	export default rehypeSlug;
}
