import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Mock MutationObserver since happy-dom's implementation doesn't work with React's virtual DOM
// biome-ignore lint/complexity/noUselessConstructor: Required to satisfy MutationObserver interface signature
class MockMutationObserver {
	constructor(_callback: MutationCallback) {}
	observe(_target: Node, _options?: MutationObserverInit): void {}
	disconnect(): void {}
	takeRecords(): MutationRecord[] {
		return [];
	}
}

globalThis.MutationObserver =
	MockMutationObserver as unknown as typeof MutationObserver;
