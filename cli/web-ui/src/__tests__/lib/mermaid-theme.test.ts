import { describe, expect, test } from "bun:test";
import { warmStoneDark, warmStoneLight } from "../../lib/mermaid-theme";

const lightCanvas = "#f0f0ee";
const darkCanvas = "#211e1c";

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.replace("#", "");
	const value = Number.parseInt(normalized, 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
	const channels = hexToRgb(hex).map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
	const lighter = Math.max(luminance(foreground), luminance(background));
	const darker = Math.min(luminance(foreground), luminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}

describe("Mermaid theme", () => {
	test("keeps primary diagram text readable in light and dark modes", () => {
		const pairs = [
			[warmStoneLight.textColor, warmStoneLight.mainBkg],
			[warmStoneLight.textColor, warmStoneLight.secondaryColor],
			[warmStoneLight.textColor, warmStoneLight.tertiaryColor],
			[warmStoneDark.textColor, warmStoneDark.mainBkg],
			[warmStoneDark.textColor, warmStoneDark.secondaryColor],
			[warmStoneDark.textColor, warmStoneDark.tertiaryColor],
		];

		for (const [foreground, background] of pairs) {
			expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("keeps Mermaid connector lines visible without making them dominant", () => {
		expect(
			contrastRatio(warmStoneLight.lineColor, lightCanvas),
		).toBeGreaterThanOrEqual(3);
		expect(
			contrastRatio(warmStoneDark.lineColor, darkCanvas),
		).toBeGreaterThanOrEqual(3);
	});
});
