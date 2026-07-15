/**
 * `<tm-code-walkthrough>` — step through a code listing, highlighting the lines
 * each step explains.
 *
 * Hydrates from the schema `code-walkthrough.data` island:
 * `{ lang, code, steps: [{ lines, md }] }` where `lines` is a 1-based range
 * spec such as `"3"`, `"3-7"`, or `"3,5,9-11"`.
 *
 * Renders the code once as escaped, line-numbered text (no runtime highlighting
 * library, REQ-007), then advances through steps with Previous/Next buttons.
 * The active step's lines get an `is-highlighted` class and `aria-current`, and
 * the step explanation renders in a polite live region. Code is plain text, so
 * there is no markup-injection surface.
 */

import { parseLineRange } from "./line-range.js";
import {
	button,
	defineWidget,
	el,
	readIsland,
	setInlineMarkdown,
} from "./runtime.js";

interface WalkthroughStep {
	lines: string;
	md: string;
}

interface CodeWalkthroughData {
	lang: string;
	code: string;
	steps: WalkthroughStep[];
}

class CodeWalkthroughElement extends HTMLElement {
	private steps: WalkthroughStep[] = [];
	private index = 0;
	private lineNodes: HTMLElement[] = [];
	private explanation!: HTMLElement;
	private position!: HTMLElement;
	private prevButton!: HTMLButtonElement;
	private nextButton!: HTMLButtonElement;

	connectedCallback(): void {
		const data = readIsland<CodeWalkthroughData>(this);
		if (!data || data.steps.length === 0) {
			return;
		}
		this.steps = data.steps;
		this.replaceChildren();
		this.classList.add("tm-code-walkthrough");

		const pre = el("pre", "tm-code-walkthrough__code");
		pre.setAttribute("aria-label", `Code (${data.lang})`);
		const lines = data.code.replace(/\n$/, "").split("\n");
		lines.forEach((line, i) => {
			const row = el("span", "tm-code-walkthrough__line");
			row.appendChild(el("span", "tm-code-walkthrough__lineno", String(i + 1)));
			// Preserve empty lines with a non-empty text node height.
			row.appendChild(el("span", "tm-code-walkthrough__src", line || " "));
			this.lineNodes.push(row);
			pre.appendChild(row);
		});

		this.position = el("p", "tm-code-walkthrough__position");
		this.position.setAttribute("aria-hidden", "true");
		this.explanation = el("div", "tm-code-walkthrough__explain");
		this.explanation.setAttribute("role", "region");
		this.explanation.setAttribute("aria-live", "polite");
		this.explanation.setAttribute("aria-label", "Step explanation");
		this.explanation.setAttribute("tabindex", "-1");

		const nav = el("div", "tm-code-walkthrough__nav");
		this.prevButton = button("Previous", "tm-btn", () => this.go(-1));
		this.nextButton = button("Next", "tm-btn", () => this.go(1));
		nav.append(this.prevButton, this.nextButton);

		this.append(pre, this.position, this.explanation, nav);
		this.render();
	}

	private go(delta: number): void {
		const next = this.index + delta;
		if (next < 0 || next >= this.steps.length) {
			return;
		}
		this.index = next;
		this.render();
		this.explanation.focus();
	}

	private render(): void {
		const step = this.steps[this.index];
		if (!step) {
			return;
		}
		this.position.textContent = `Step ${this.index + 1} of ${this.steps.length}`;
		const active = parseLineRange(step.lines, this.lineNodes.length);
		this.lineNodes.forEach((node, i) => {
			const on = active.has(i + 1);
			node.classList.toggle("is-highlighted", on);
			if (on) {
				node.setAttribute("aria-current", "step");
			} else {
				node.removeAttribute("aria-current");
			}
		});
		setInlineMarkdown(this.explanation, step.md);
		this.prevButton.disabled = this.index === 0;
		this.nextButton.disabled = this.index === this.steps.length - 1;
	}
}

/** Register the `<tm-code-walkthrough>` element. */
export function registerCodeWalkthrough(): void {
	defineWidget("tm-code-walkthrough", CodeWalkthroughElement);
}
