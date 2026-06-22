/**
 * `<tm-stepper>` — advance through ordered explanatory steps.
 *
 * Hydrates from the schema `stepper.data` island:
 * `{ steps: [{ title, md }] }`.
 *
 * Renders a numbered step indicator, the current step's title and rendered
 * markdown body, and Previous/Next buttons. The step list is a real `<ol>` with
 * the active step marked via `aria-current`; the body is a polite live region.
 */

import {
	button,
	defineWidget,
	el,
	readIsland,
	setInlineMarkdown,
} from "./runtime.js";

interface StepperStep {
	title: string;
	md: string;
}

interface StepperData {
	steps: StepperStep[];
}

class StepperElement extends HTMLElement {
	private steps: StepperStep[] = [];
	private index = 0;
	private markers: HTMLLIElement[] = [];
	private body!: HTMLElement;
	private titleEl!: HTMLElement;
	private prevButton!: HTMLButtonElement;
	private nextButton!: HTMLButtonElement;

	connectedCallback(): void {
		const data = readIsland<StepperData>(this);
		if (!data || data.steps.length === 0) {
			return;
		}
		this.steps = data.steps;
		this.replaceChildren();
		this.classList.add("tm-stepper");

		const markerList = el("ol", "tm-stepper__markers");
		markerList.setAttribute("aria-label", "Steps");
		this.steps.forEach((step, i) => {
			const marker = el("li", "tm-stepper__marker", `${i + 1}. ${step.title}`);
			this.markers.push(marker);
			markerList.appendChild(marker);
		});

		this.titleEl = el("h4", "tm-stepper__title");
		this.body = el("div", "tm-stepper__body");
		this.body.setAttribute("role", "region");
		this.body.setAttribute("aria-live", "polite");
		this.body.setAttribute("aria-label", "Step detail");

		const nav = el("div", "tm-stepper__nav");
		this.prevButton = button("Previous", "tm-btn", () => this.go(-1));
		this.nextButton = button("Next", "tm-btn", () => this.go(1));
		nav.append(this.prevButton, this.nextButton);

		this.append(markerList, this.titleEl, this.body, nav);
		this.render();
	}

	private go(delta: number): void {
		const next = this.index + delta;
		if (next < 0 || next >= this.steps.length) {
			return;
		}
		this.index = next;
		this.render();
	}

	private render(): void {
		const step = this.steps[this.index];
		if (!step) {
			return;
		}
		this.titleEl.textContent = step.title;
		setInlineMarkdown(this.body, step.md);
		this.markers.forEach((marker, i) => {
			marker.classList.toggle("is-active", i === this.index);
			if (i === this.index) {
				marker.setAttribute("aria-current", "step");
			} else {
				marker.removeAttribute("aria-current");
			}
		});
		this.prevButton.disabled = this.index === 0;
		this.nextButton.disabled = this.index === this.steps.length - 1;
	}
}

/** Register the `<tm-stepper>` element. */
export function registerStepper(): void {
	defineWidget("tm-stepper", StepperElement);
}
