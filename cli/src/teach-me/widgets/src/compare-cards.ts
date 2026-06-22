/**
 * `<tm-compare-cards>` — present side-by-side comparison cards.
 *
 * Hydrates from the schema `compare-cards.data` island:
 * `{ cards: [{ title, points: string[] }] }`.
 *
 * Renders each card as an article with a heading and a bulleted point list.
 * This block is primarily presentational, but it lives in the interactive set
 * because it hydrates from data; the layout is a responsive grid styled in
 * `tm-base.css`. Each card is a labeled landmark so the comparison is navigable.
 */

import { defineWidget, el, readIsland } from "./runtime.js";

interface CompareCard {
	title: string;
	points: string[];
}

interface CompareCardsData {
	cards: CompareCard[];
}

class CompareCardsElement extends HTMLElement {
	connectedCallback(): void {
		const data = readIsland<CompareCardsData>(this);
		if (!data || data.cards.length === 0) {
			return;
		}
		this.replaceChildren();
		this.classList.add("tm-compare-cards");
		const grid = el("div", "tm-compare-cards__grid");

		for (const card of data.cards) {
			const article = el("article", "tm-compare-cards__card");
			article.setAttribute("aria-label", card.title);
			article.appendChild(el("h4", "tm-compare-cards__title", card.title));
			if (card.points.length > 0) {
				const list = el("ul", "tm-compare-cards__points");
				for (const point of card.points) {
					list.appendChild(el("li", undefined, point));
				}
				article.appendChild(list);
			}
			grid.appendChild(article);
		}

		this.appendChild(grid);
	}
}

/** Register the `<tm-compare-cards>` element. */
export function registerCompareCards(): void {
	defineWidget("tm-compare-cards", CompareCardsElement);
}
