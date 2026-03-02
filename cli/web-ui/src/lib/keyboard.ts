export function isTextInputElement(element: Element | null): boolean {
	if (!element) return false;

	const tagName = element.tagName.toLowerCase();
	if (tagName === "input") {
		const inputType = (element as HTMLInputElement).type?.toLowerCase();
		const textInputTypes = [
			"text",
			"password",
			"email",
			"search",
			"tel",
			"url",
			"number",
		];
		return textInputTypes.includes(inputType);
	}

	if (tagName === "textarea") return true;
	if ((element as HTMLElement).isContentEditable) return true;

	return false;
}
