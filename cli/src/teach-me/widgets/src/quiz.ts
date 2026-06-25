/**
 * `<tm-quiz>` — multiple-choice comprehension check with a "Check answer" step.
 *
 * Hydrates from the schema `quiz.data` island:
 * `{ questions: [{ q, choices: string[], answer: number, explanation }] }`
 * where `answer` is a 0-based index into `choices` (the schema guarantees it is
 * in range).
 *
 * Each question is a `<fieldset>`/`<legend>` with radio options; "Check answer"
 * marks each option correct/incorrect (with a text label, not color alone) and
 * reveals the explanation in a polite live region. State is per-question and
 * kept in memory only (sandbox-safe; nothing persisted).
 */

import { button, defineWidget, el, readIsland } from "./runtime.js";

interface QuizQuestion {
	q: string;
	choices: string[];
	answer: number;
	explanation: string;
}

interface QuizData {
	questions: QuizQuestion[];
}

class QuizElement extends HTMLElement {
	connectedCallback(): void {
		const data = readIsland<QuizData>(this);
		if (!data || data.questions.length === 0) {
			return;
		}
		this.replaceChildren();
		this.classList.add("tm-quiz");
		const uid = Math.random().toString(36).slice(2, 8);
		data.questions.forEach((question, qi) => {
			this.appendChild(this.buildQuestion(question, `${uid}-${qi}`));
		});
	}

	private buildQuestion(question: QuizQuestion, name: string): HTMLElement {
		const fieldset = el("fieldset", "tm-quiz__q");
		fieldset.appendChild(el("legend", "tm-quiz__legend", question.q));

		const inputs: HTMLInputElement[] = [];
		const labels: HTMLLabelElement[] = [];
		question.choices.forEach((choice, ci) => {
			const id = `tm-quiz-${name}-${ci}`;
			const row = el("label", "tm-quiz__choice");
			row.htmlFor = id;
			const input = document.createElement("input");
			input.type = "radio";
			input.name = name;
			input.id = id;
			input.value = String(ci);
			const text = el("span", "tm-quiz__choice-text", choice);
			row.append(input, text);
			inputs.push(input);
			labels.push(row);
			fieldset.appendChild(row);
		});

		const feedback = el("p", "tm-quiz__feedback");
		feedback.setAttribute("role", "status");
		feedback.setAttribute("aria-live", "polite");

		const explanation = el("div", "tm-quiz__explanation");
		explanation.hidden = true;

		const check = button("Check answer", "tm-btn", () => {
			const chosen = inputs.findIndex((input) => input.checked);
			if (chosen === -1) {
				feedback.textContent = "Select an answer first.";
				return;
			}
			labels.forEach((label, i) => {
				label.classList.remove("is-correct", "is-incorrect");
				if (i === question.answer) {
					label.classList.add("is-correct");
				} else if (i === chosen) {
					label.classList.add("is-incorrect");
				}
			});
			const correct = chosen === question.answer;
			feedback.textContent = correct
				? "Correct."
				: `Not quite — the correct answer is "${question.choices[question.answer]}".`;
			feedback.dataset.result = correct ? "correct" : "incorrect";
			explanation.textContent = question.explanation;
			explanation.hidden = false;

			inputs.forEach((input) => {
				input.disabled = true;
			});
			check.disabled = true;

			if (!correct) {
				const retry = button("Try again", "tm-btn tm-btn--ghost", () => {
					inputs.forEach((input) => {
						input.disabled = false;
						input.checked = false;
					});
					labels.forEach((label) => {
						label.classList.remove("is-correct", "is-incorrect");
					});
					check.disabled = false;
					feedback.textContent = "";
					delete feedback.dataset.result;
					explanation.hidden = true;
					retry.remove();
				});
				fieldset.appendChild(retry);
			}
		});

		fieldset.append(check, feedback, explanation);
		return fieldset;
	}
}

/** Register the `<tm-quiz>` element. */
export function registerQuiz(): void {
	defineWidget("tm-quiz", QuizElement);
}
