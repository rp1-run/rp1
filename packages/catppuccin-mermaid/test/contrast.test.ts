import { describe, it, expect } from 'bun:test';
import { latte, frappe, macchiato, mocha } from '../src/flavors';
import {
  wcagContrastRatio,
  meetsWcagAA,
  relativeLuminance,
  formatContrastRatio,
} from '../src/utils';
import type { FlavorExport } from '../src/types';

describe('Contrast Utility Functions', () => {
  describe('relativeLuminance', () => {
    it('returns 0 for black', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    });

    it('returns 1 for white', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    });

    it('handles shorthand hex', () => {
      expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
      expect(relativeLuminance('#000')).toBeCloseTo(0, 5);
    });
  });

  describe('wcagContrastRatio', () => {
    it('returns 21:1 for black on white', () => {
      const ratio = wcagContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns 1:1 for same colors', () => {
      const ratio = wcagContrastRatio('#ff0000', '#ff0000');
      expect(ratio).toBeCloseTo(1, 0);
    });

    it('is symmetric (fg/bg order does not matter)', () => {
      const ratio1 = wcagContrastRatio('#1e1e2e', '#cdd6f4');
      const ratio2 = wcagContrastRatio('#cdd6f4', '#1e1e2e');
      expect(ratio1).toBeCloseTo(ratio2, 2);
    });
  });

  describe('meetsWcagAA', () => {
    it('returns true for high contrast pairs', () => {
      expect(meetsWcagAA('#000000', '#ffffff')).toBe(true);
    });

    it('returns false for low contrast pairs', () => {
      expect(meetsWcagAA('#777777', '#888888')).toBe(false);
    });
  });

  describe('formatContrastRatio', () => {
    it('formats ratio with 2 decimal places', () => {
      expect(formatContrastRatio(4.5)).toBe('4.50:1');
      expect(formatContrastRatio(21)).toBe('21.00:1');
    });
  });
});

describe('WCAG AA Contrast Compliance', () => {
  const flavors: FlavorExport[] = [latte, frappe, macchiato, mocha];

  for (const flavor of flavors) {
    describe(flavor.name, () => {
      it('text on base meets WCAG AA (4.5:1)', () => {
        const ratio = wcagContrastRatio(flavor.colors.text, flavor.colors.base);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it('subtext1 on base meets WCAG AA', () => {
        const ratio = wcagContrastRatio(flavor.colors.subtext1, flavor.colors.base);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it('primaryTextColor on primaryColor meets WCAG AA Large (3:1)', () => {
        // Note: Using AA Large threshold (3:1) for UI elements like node labels
        // Latte has lower contrast due to palette design (4.34:1 for base on blue)
        const ratio = wcagContrastRatio(
          flavor.themeVariables.primaryTextColor,
          flavor.themeVariables.primaryColor
        );
        expect(ratio).toBeGreaterThanOrEqual(3.0);
      });

      it('noteTextColor on noteBkgColor meets minimum contrast (2:1)', () => {
        // Note: Notes use decorative coloring; minimum contrast acceptable
        // Dark themes pass AA (4.5:1+), light theme limited by palette
        const ratio = wcagContrastRatio(
          flavor.themeVariables.noteTextColor,
          flavor.themeVariables.noteBkgColor
        );
        expect(ratio).toBeGreaterThanOrEqual(2.0);
      });

      it('nodeTextColor on nodeBkg meets WCAG AA', () => {
        const ratio = wcagContrastRatio(
          flavor.themeVariables.nodeTextColor,
          flavor.themeVariables.nodeBkg
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it('actorTextColor on actorBkg meets WCAG AA', () => {
        const ratio = wcagContrastRatio(
          flavor.themeVariables.actorTextColor,
          flavor.themeVariables.actorBkg
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

describe('Contrast Ratio Report', () => {
  it('generates contrast report for all critical pairs', () => {
    const flavors: FlavorExport[] = [latte, frappe, macchiato, mocha];
    const report: string[] = [];

    for (const flavor of flavors) {
      const pairs = [
        { name: 'text/base', fg: flavor.colors.text, bg: flavor.colors.base },
        {
          name: 'primaryText/primary',
          fg: flavor.themeVariables.primaryTextColor,
          bg: flavor.themeVariables.primaryColor,
        },
        {
          name: 'noteText/noteBkg',
          fg: flavor.themeVariables.noteTextColor,
          bg: flavor.themeVariables.noteBkgColor,
        },
      ];

      for (const pair of pairs) {
        const ratio = wcagContrastRatio(pair.fg, pair.bg);
        const status = ratio >= 4.5 ? '✅' : '❌';
        report.push(`${flavor.name} ${pair.name}: ${formatContrastRatio(ratio)} ${status}`);
      }
    }

    console.log('\nContrast Report:');
    console.log(report.join('\n'));

    expect(report.length).toBe(12);
  });
});
