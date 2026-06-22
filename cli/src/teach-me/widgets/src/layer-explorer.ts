/**
 * `<tm-layer-explorer>` — inspect the layers of an architecture top-to-bottom.
 *
 * Hydrates from the schema `layer-explorer.data` island:
 * `{ layers: [{ id, name, responsibilities: string[] }] }`.
 *
 * Renders the layers as a vertical stack of selectable buttons (preserving
 * source order, which carries the layering meaning) and shows the selected
 * layer's responsibilities. Selection is reflected via `aria-pressed`; the
 * responsibilities panel is a polite live region.
 */

import { button, defineWidget, el, readIsland } from "./runtime.js";

interface ArchLayer {
	id: string;
	name: string;
	responsibilities: string[];
}

interface LayerExplorerData {
	layers: ArchLayer[];
}

class LayerExplorerElement extends HTMLElement {
	private layers: ArchLayer[] = [];
	private buttons = new Map<string, HTMLButtonElement>();
	private detail!: HTMLElement;
	private selected = "";

	connectedCallback(): void {
		const data = readIsland<LayerExplorerData>(this);
		if (!data || data.layers.length === 0) {
			return;
		}
		this.layers = data.layers;
		this.replaceChildren();
		this.classList.add("tm-layer-explorer");

		const stack = el("div", "tm-layer-explorer__stack");
		stack.setAttribute("role", "group");
		stack.setAttribute("aria-label", "Architecture layers, top to bottom");
		this.layers.forEach((layer, i) => {
			const btn = button(
				`${i + 1}. ${layer.name}`,
				"tm-btn tm-layer-explorer__layer",
				() => this.select(layer.id),
			);
			this.buttons.set(layer.id, btn);
			stack.appendChild(btn);
		});

		this.detail = el("div", "tm-layer-explorer__detail");
		this.detail.setAttribute("role", "region");
		this.detail.setAttribute("aria-live", "polite");
		this.detail.setAttribute("aria-label", "Layer responsibilities");

		this.append(stack, this.detail);
		this.select(this.layers[0]?.id ?? "");
	}

	private select(id: string): void {
		this.selected = id;
		for (const [layerId, btn] of this.buttons) {
			btn.setAttribute("aria-pressed", String(layerId === id));
			btn.classList.toggle("is-active", layerId === id);
		}
		const layer = this.layers.find((l) => l.id === this.selected);
		this.detail.replaceChildren();
		if (!layer) {
			return;
		}
		this.detail.appendChild(el("h4", "tm-layer-explorer__name", layer.name));
		if (layer.responsibilities.length > 0) {
			const list = el("ul", "tm-layer-explorer__responsibilities");
			for (const item of layer.responsibilities) {
				list.appendChild(el("li", undefined, item));
			}
			this.detail.appendChild(list);
		}
	}
}

/** Register the `<tm-layer-explorer>` element. */
export function registerLayerExplorer(): void {
	defineWidget("tm-layer-explorer", LayerExplorerElement);
}
