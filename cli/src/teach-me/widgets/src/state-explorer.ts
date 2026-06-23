/**
 * `<tm-state-explorer>` — inspect the states and transitions of a state machine.
 *
 * Hydrates from the schema `state-explorer.data` island:
 * `{ initial?, states: [{ id, label, description? }],
 * transitions: [{ from, to, label? }] }`.
 *
 * Lists the states as a selectable button group; selecting a state shows its
 * description and the transitions that leave it (with their targets resolved to
 * labels). The selected state is reflected via `aria-pressed`, and outgoing
 * transitions are announced in a live region so the machine is explorable
 * without relying on a rendered graph.
 */

import { button, defineWidget, el, readIsland } from "./runtime.js";

interface ExplorerState {
	id: string;
	label: string;
	description?: string;
}

interface ExplorerTransition {
	from: string;
	to: string;
	label?: string;
}

interface StateExplorerData {
	initial?: string;
	states: ExplorerState[];
	transitions: ExplorerTransition[];
}

class StateExplorerElement extends HTMLElement {
	private data!: StateExplorerData;
	private buttons = new Map<string, HTMLButtonElement>();
	private detail!: HTMLElement;
	private selected = "";

	connectedCallback(): void {
		const data = readIsland<StateExplorerData>(this);
		if (!data || data.states.length === 0) {
			return;
		}
		this.data = data;
		this.replaceChildren();
		this.classList.add("tm-state-explorer");

		const group = el("div", "tm-state-explorer__states");
		group.setAttribute("role", "group");
		group.setAttribute("aria-label", "States");
		for (const state of data.states) {
			const btn = button(state.label, "tm-btn", () => this.select(state.id));
			this.buttons.set(state.id, btn);
			group.appendChild(btn);
		}

		this.detail = el("div", "tm-state-explorer__detail");
		this.detail.setAttribute("role", "region");
		this.detail.setAttribute("aria-live", "polite");
		this.detail.setAttribute("aria-label", "State detail");

		this.append(group, this.detail);
		this.select(data.initial ?? data.states[0]?.id ?? "");
	}

	private labelFor(id: string): string {
		return this.data.states.find((state) => state.id === id)?.label ?? id;
	}

	private select(id: string): void {
		this.selected = id;
		for (const [stateId, btn] of this.buttons) {
			btn.setAttribute("aria-pressed", String(stateId === id));
			btn.classList.toggle("is-active", stateId === id);
		}
		this.renderDetail();
	}

	private renderDetail(): void {
		const state = this.data.states.find((s) => s.id === this.selected);
		this.detail.replaceChildren();
		if (!state) {
			return;
		}
		this.detail.appendChild(el("h4", "tm-state-explorer__name", state.label));
		if (state.description) {
			this.detail.appendChild(
				el("p", "tm-state-explorer__desc", state.description),
			);
		}

		const outgoing = this.data.transitions.filter(
			(t) => t.from === this.selected,
		);
		const heading = el(
			"p",
			"tm-state-explorer__transitions-heading",
			outgoing.length > 0
				? "Transitions out"
				: "No transitions out of this state",
		);
		this.detail.appendChild(heading);

		if (outgoing.length > 0) {
			const list = el("ul", "tm-state-explorer__transitions");
			for (const transition of outgoing) {
				const target = this.labelFor(transition.to);
				const text = transition.label
					? `${transition.label} -> ${target}`
					: `-> ${target}`;
				const item = el("li", undefined);
				const link = button(text, "tm-link", () => this.select(transition.to));
				item.appendChild(link);
				list.appendChild(item);
			}
			this.detail.appendChild(list);
		}
	}
}

/** Register the `<tm-state-explorer>` element. */
export function registerStateExplorer(): void {
	defineWidget("tm-state-explorer", StateExplorerElement);
}
