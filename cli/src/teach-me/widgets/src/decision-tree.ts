/**
 * `<tm-decision-tree>` — walk a branching question tree to a verdict.
 *
 * Hydrates from the schema `decision-tree.data` island: `{ root: DecisionNode }`
 * where `DecisionNode = { question, branches: [{ label, terminal?: { verdict,
 * text }, node?: DecisionNode }] }` and each branch resolves to exactly one of a
 * nested node or a terminal verdict.
 *
 * Presents the current question with one real button per branch; selecting a
 * branch advances to the next node or shows the verdict, and a "Start over"
 * button resets. The path taken is shown as a breadcrumb so the choice is never
 * conveyed by position alone, and the verdict carries a text label (not color
 * alone).
 */

import { button, defineWidget, el, readIsland } from "./runtime.js";

interface DecisionTerminal {
	verdict: "yes" | "no" | "maybe";
	text: string;
}

interface DecisionBranch {
	label: string;
	terminal?: DecisionTerminal;
	node?: DecisionNode;
}

interface DecisionNode {
	question: string;
	branches: DecisionBranch[];
}

interface DecisionTreeData {
	root: DecisionNode;
}

const VERDICT_LABEL: Record<DecisionTerminal["verdict"], string> = {
	yes: "Yes",
	no: "No",
	maybe: "Maybe",
};

class DecisionTreeElement extends HTMLElement {
	private root!: DecisionNode;
	private path: string[] = [];
	private body!: HTMLElement;
	private trail!: HTMLElement;
	private reset!: HTMLButtonElement;

	connectedCallback(): void {
		const data = readIsland<DecisionTreeData>(this);
		if (!data || !data.root) {
			return;
		}
		this.root = data.root;
		this.replaceChildren();
		this.classList.add("tm-decision-tree");

		this.trail = el("ol", "tm-decision-tree__trail");
		this.trail.setAttribute("aria-label", "Choices made");
		this.body = el("div", "tm-decision-tree__body");
		this.body.setAttribute("aria-live", "polite");

		this.reset = button(
			"Start over",
			"tm-btn tm-btn--ghost tm-decision-tree__reset",
			() => {
				this.path = [];
				this.renderNode(this.root);
			},
		);

		this.append(this.trail, this.body, this.reset);
		this.renderNode(this.root);
	}

	private renderTrail(): void {
		this.trail.replaceChildren();
		for (const label of this.path) {
			this.trail.appendChild(el("li", "tm-decision-tree__crumb", label));
		}
	}

	private renderNode(node: DecisionNode): void {
		this.renderTrail();
		this.body.replaceChildren();
		this.body.appendChild(el("p", "tm-decision-tree__question", node.question));

		const choices = el("div", "tm-decision-tree__choices");
		for (const branch of node.branches) {
			const choice = button("", "tm-btn", () => this.choose(branch));
			choice.textContent = branch.label;
			choices.appendChild(choice);
		}
		this.body.appendChild(choices);
		this.reset.hidden = this.path.length === 0;
	}

	private choose(branch: DecisionBranch): void {
		this.path.push(branch.label);
		if (branch.node) {
			this.renderNode(branch.node);
			return;
		}
		if (branch.terminal) {
			this.renderVerdict(branch.terminal);
		}
	}

	private renderVerdict(terminal: DecisionTerminal): void {
		this.renderTrail();
		this.body.replaceChildren();
		const card = el("div", "tm-decision-tree__verdict");
		card.dataset.verdict = terminal.verdict;
		card.setAttribute("role", "status");
		card.appendChild(
			el(
				"span",
				"tm-decision-tree__verdict-label",
				VERDICT_LABEL[terminal.verdict],
			),
		);
		card.appendChild(el("p", "tm-decision-tree__verdict-text", terminal.text));
		this.body.appendChild(card);
		this.reset.hidden = false;
	}
}

/** Register the `<tm-decision-tree>` element. */
export function registerDecisionTree(): void {
	defineWidget("tm-decision-tree", DecisionTreeElement);
}
