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
	private stack!: HTMLElement;

	connectedCallback(): void {
		const data = readIsland<LayerExplorerData>(this);
		if (!data || data.layers.length === 0) {
			return;
		}
		this.layers = data.layers;
		this.replaceChildren();
		this.classList.add("tm-layer-explorer");

		this.stack = el("div", "tm-layer-explorer__stack");
		this.stack.setAttribute("role", "group");
		this.stack.setAttribute("aria-label", "Architecture layers, top to bottom");
		this.layers.forEach((layer, i) => {
			const btn = button(
				`${i + 1}. ${layer.name}`,
				"tm-btn tm-layer-explorer__layer",
				() => this.select(layer.id),
			);
			btn.setAttribute("tabindex", "-1");
			this.buttons.set(layer.id, btn);
			this.stack.appendChild(btn);
		});
		this.stack.addEventListener("keydown", (e) => this.handleGroupKeydown(e));

		this.detail = el("div", "tm-layer-explorer__detail");
		this.detail.setAttribute("role", "region");
		this.detail.setAttribute("aria-live", "polite");
		this.detail.setAttribute("aria-label", "Layer responsibilities");

		this.append(this.stack, this.detail);
		this.select(this.layers[0]?.id ?? "");
	}

	private select(id: string): void {
		this.selected = id;
		for (const [layerId, btn] of this.buttons) {
			const active = layerId === id;
			btn.setAttribute("aria-pressed", String(active));
			btn.classList.toggle("is-active", active);
			btn.setAttribute("tabindex", active ? "0" : "-1");
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

	private handleGroupKeydown(e: KeyboardEvent): void {
		const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
		const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
		if (!forward && !backward) {
			return;
		}
		e.preventDefault();
		const ids = Array.from(this.buttons.keys());
		const cur = ids.indexOf(this.selected);
		if (cur === -1) {
			return;
		}
		const next = forward
			? (cur + 1) % ids.length
			: (cur - 1 + ids.length) % ids.length;
		this.select(ids[next]);
		this.buttons.get(ids[next])?.focus();
	}
}

/** Register the `<tm-layer-explorer>` element. */
export function registerLayerExplorer(): void {
	defineWidget("tm-layer-explorer", LayerExplorerElement);
}
