import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Mock MutationObserver since happy-dom's implementation doesn't work with React's virtual DOM
class MockMutationObserver {
	private callback: MutationCallback;

	constructor(callback: MutationCallback) {
		this.callback = callback;
	}

	observe(_target: Node, _options?: MutationObserverInit): void {
		// No-op in tests
	}

	disconnect(): void {
		// No-op in tests
	}

	takeRecords(): MutationRecord[] {
		return [];
	}
}

globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;
