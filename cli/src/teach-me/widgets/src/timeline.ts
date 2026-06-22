/**
 * `<tm-timeline>` — step or scrub through an ordered sequence of states.
 *
 * Hydrates from the schema `timeline.data` island:
 * `{ controls: "step" | "scrub", actors: string[], steps: [{ title, desc,
 * state?: Record<string, string>, annotations?: string[] }] }`.
 *
 * Renders the current step's title/description, any per-actor state, and
 * annotations. Navigation uses real buttons (step) or a labeled range slider
 * (scrub). A live region announces step changes; transitions are CSS-gated on
 * `prefers-reduced-motion`.
 */

import { button, defineWidget, el, readIsland } from "./runtime.js";

interface TimelineStep {
	title: string;
	desc: string;
	state?: Record<string, string>;
	annotations?: string[];
}

interface TimelineData {
	controls: "step" | "scrub";
	actors: string[];
	steps: TimelineStep[];
}

class TimelineElement extends HTMLElement {
	private steps: TimelineStep[] = [];
	private index = 0;
	private current!: HTMLElement;
	private position!: HTMLElement;
	private prevButton?: HTMLButtonElement;
	private nextButton?: HTMLButtonElement;
	private slider?: HTMLInputElement;

	connectedCallback(): void {
		const data = readIsland<TimelineData>(this);
		if (!data || data.steps.length === 0) {
			return;
		}
		this.steps = data.steps;
		this.replaceChildren();
		this.classList.add("tm-timeline");

		const controls = el("div", "tm-timeline__controls");
		if (data.controls === "scrub") {
			controls.appendChild(this.buildScrubber());
		} else {
			controls.append(this.buildStepButtons());
		}

		this.position = el("p", "tm-timeline__position");
		this.position.setAttribute("aria-hidden", "true");

		this.current = el("div", "tm-timeline__step");
		this.current.setAttribute("role", "region");
		this.current.setAttribute("aria-live", "polite");
		this.current.setAttribute("aria-label", "Current step");

		this.append(controls, this.position, this.current);
		this.render();
	}

	private buildStepButtons(): DocumentFragment {
		const frag = document.createDocumentFragment();
		this.prevButton = button("Previous step", "tm-btn", () => this.go(-1));
		this.nextButton = button("Next step", "tm-btn", () => this.go(1));
		frag.append(this.prevButton, this.nextButton);
		return frag;
	}

	private buildScrubber(): HTMLElement {
		const wrap = el("div", "tm-timeline__scrub");
		const label = el("label", "tm-timeline__scrub-label", "Step");
		const slider = document.createElement("input");
		slider.type = "range";
		slider.min = "0";
		slider.max = String(this.steps.length - 1);
		slider.step = "1";
		slider.value = "0";
		slider.className = "tm-timeline__slider";
		slider.id = `tm-timeline-slider-${Math.random().toString(36).slice(2, 8)}`;
		label.htmlFor = slider.id;
		slider.addEventListener("input", () => {
			this.index = Number(slider.value);
			this.render();
		});
		this.slider = slider;
		wrap.append(label, slider);
		return wrap;
	}

	private go(delta: number): void {
		const next = this.index + delta;
		if (next < 0 || next >= this.steps.length) {
			return;
		}
		this.index = next;
		if (this.slider) {
			this.slider.value = String(this.index);
		}
		this.render();
	}

	private render(): void {
		const step = this.steps[this.index];
		if (!step) {
			return;
		}
		this.position.textContent = `Step ${this.index + 1} of ${this.steps.length}`;
		this.current.replaceChildren();
		this.current.appendChild(el("h4", "tm-timeline__title", step.title));
		this.current.appendChild(el("p", "tm-timeline__desc", step.desc));

		if (step.state && Object.keys(step.state).length > 0) {
			const list = el("dl", "tm-timeline__state");
			for (const [key, value] of Object.entries(step.state)) {
				list.appendChild(el("dt", "tm-timeline__state-key", key));
				list.appendChild(el("dd", "tm-timeline__state-val", value));
			}
			this.current.appendChild(list);
		}

		if (step.annotations && step.annotations.length > 0) {
			const notes = el("ul", "tm-timeline__notes");
			for (const note of step.annotations) {
				notes.appendChild(el("li", undefined, note));
			}
			this.current.appendChild(notes);
		}

		if (this.prevButton) {
			this.prevButton.disabled = this.index === 0;
		}
		if (this.nextButton) {
			this.nextButton.disabled = this.index === this.steps.length - 1;
		}
	}
}

/** Register the `<tm-timeline>` element. */
export function registerTimeline(): void {
	defineWidget("tm-timeline", TimelineElement);
}
