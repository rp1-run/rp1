import { describe, it, expect } from 'bun:test';
import { latte, frappe, macchiato, mocha } from '../src/flavors';
import type { CatppuccinColor, FlavorExport } from '../src/types';

const ALL_COLORS: CatppuccinColor[] = [
  'rosewater',
  'flamingo',
  'pink',
  'mauve',
  'red',
  'maroon',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'sapphire',
  'blue',
  'lavender',
  'text',
  'subtext1',
  'subtext0',
  'overlay2',
  'overlay1',
  'overlay0',
  'surface2',
  'surface1',
  'surface0',
  'base',
  'mantle',
  'crust',
];

const EXPECTED_COLORS = {
  latte: {
    base: '#eff1f5',
    text: '#4c4f69',
    blue: '#1e66f5',
    crust: '#dce0e8',
  },
  frappe: {
    base: '#303446',
    text: '#c6d0f5',
    blue: '#8caaee',
    crust: '#232634',
  },
  macchiato: {
    base: '#24273a',
    text: '#cad3f5',
    blue: '#8aadf4',
    crust: '#181926',
  },
  mocha: {
    base: '#1e1e2e',
    text: '#cdd6f4',
    blue: '#89b4fa',
    crust: '#11111b',
  },
} as const;

function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

describe('Palette Completeness', () => {
  const flavors: FlavorExport[] = [latte, frappe, macchiato, mocha];

  for (const flavor of flavors) {
    describe(flavor.name, () => {
      it('has all 26 colors defined', () => {
        for (const colorName of ALL_COLORS) {
          expect(flavor.colors).toHaveProperty(colorName);
        }
        expect(Object.keys(flavor.colors)).toHaveLength(26);
      });

      it('has valid hex color values', () => {
        for (const [colorName, hexValue] of Object.entries(flavor.colors)) {
          expect(isValidHex(hexValue)).toBe(true);
        }
      });
    });
  }
});

describe('Palette Accuracy (BR-001)', () => {
  it('Latte colors match official Catppuccin values', () => {
    expect(latte.colors.base).toBe(EXPECTED_COLORS.latte.base);
    expect(latte.colors.text).toBe(EXPECTED_COLORS.latte.text);
    expect(latte.colors.blue).toBe(EXPECTED_COLORS.latte.blue);
    expect(latte.colors.crust).toBe(EXPECTED_COLORS.latte.crust);
  });

  it('Frappé colors match official Catppuccin values', () => {
    expect(frappe.colors.base).toBe(EXPECTED_COLORS.frappe.base);
    expect(frappe.colors.text).toBe(EXPECTED_COLORS.frappe.text);
    expect(frappe.colors.blue).toBe(EXPECTED_COLORS.frappe.blue);
    expect(frappe.colors.crust).toBe(EXPECTED_COLORS.frappe.crust);
  });

  it('Macchiato colors match official Catppuccin values', () => {
    expect(macchiato.colors.base).toBe(EXPECTED_COLORS.macchiato.base);
    expect(macchiato.colors.text).toBe(EXPECTED_COLORS.macchiato.text);
    expect(macchiato.colors.blue).toBe(EXPECTED_COLORS.macchiato.blue);
    expect(macchiato.colors.crust).toBe(EXPECTED_COLORS.macchiato.crust);
  });

  it('Mocha colors match official Catppuccin values', () => {
    expect(mocha.colors.base).toBe(EXPECTED_COLORS.mocha.base);
    expect(mocha.colors.text).toBe(EXPECTED_COLORS.mocha.text);
    expect(mocha.colors.blue).toBe(EXPECTED_COLORS.mocha.blue);
    expect(mocha.colors.crust).toBe(EXPECTED_COLORS.mocha.crust);
  });
});

describe('Flavor Metadata', () => {
  it('Latte is marked as light theme', () => {
    expect(latte.isDark).toBe(false);
    expect(latte.id).toBe('latte');
    expect(latte.name).toBe('Latte');
  });

  it('Frappé is marked as dark theme', () => {
    expect(frappe.isDark).toBe(true);
    expect(frappe.id).toBe('frappe');
    expect(frappe.name).toBe('Frappé');
  });

  it('Macchiato is marked as dark theme', () => {
    expect(macchiato.isDark).toBe(true);
    expect(macchiato.id).toBe('macchiato');
    expect(macchiato.name).toBe('Macchiato');
  });

  it('Mocha is marked as dark theme', () => {
    expect(mocha.isDark).toBe(true);
    expect(mocha.id).toBe('mocha');
    expect(mocha.name).toBe('Mocha');
  });
});
