import { GlobalRegistrator } from "@happy-dom/global-registrator";
import DOMPurify from "dompurify";

GlobalRegistrator.register();

// happy-dom parses a root SVG string as an HTML fragment. Keep production
// DOMPurify sanitization enabled while supplying the container a browser uses
// when Mermaid serializes an SVG root.
const purifier = DOMPurify(window);
const sanitize = purifier.sanitize.bind(purifier);
(DOMPurify as unknown as { sanitize: typeof purifier.sanitize }).sanitize = ((
	dirty: unknown,
	config?: unknown,
) => {
	if (typeof dirty === "string" && /^\s*<svg\b/i.test(dirty)) {
		const wrapped = String(
			sanitize(
				`<div data-rp1-sanitize-wrapper>${dirty}</div>`,
				config as never,
			),
		);
		return wrapped.replace(
			/^<div data-rp1-sanitize-wrapper>([\s\S]*)<\/div>$/i,
			"$1",
		);
	}
	return sanitize(dirty as never, config as never);
}) as typeof purifier.sanitize;

// Mock MutationObserver since happy-dom's implementation doesn't work with React's virtual DOM
class MockMutationObserver {
	observe(_target: Node, _options?: MutationObserverInit): void {}
	disconnect(): void {}
	takeRecords(): MutationRecord[] {
		return [];
	}
}

globalThis.MutationObserver =
	MockMutationObserver as unknown as typeof MutationObserver;
