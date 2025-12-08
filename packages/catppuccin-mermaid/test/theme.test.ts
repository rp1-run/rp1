import { describe, it, expect } from 'bun:test';
import { latte, frappe, macchiato, mocha } from '../src/flavors';
import type { FlavorExport, MermaidThemeVariables } from '../src/types';

const CORE_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'background',
  'primaryColor',
  'primaryTextColor',
  'primaryBorderColor',
  'secondaryColor',
  'secondaryTextColor',
  'secondaryBorderColor',
  'tertiaryColor',
  'tertiaryTextColor',
  'tertiaryBorderColor',
  'textColor',
  'lineColor',
  'mainBkg',
  'nodeBkg',
  'nodeBorder',
  'nodeTextColor',
  'noteBkgColor',
  'noteTextColor',
  'noteBorderColor',
];

const FLOWCHART_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'clusterBkg',
  'clusterBorder',
  'edgeLabelBackground',
];

const SEQUENCE_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'actorBkg',
  'actorBorder',
  'actorTextColor',
  'actorLineColor',
  'signalColor',
  'signalTextColor',
  'labelBoxBkgColor',
  'labelBoxBorderColor',
  'labelTextColor',
  'loopTextColor',
  'activationBorderColor',
  'activationBkgColor',
  'sequenceNumberColor',
];

const STATE_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'labelBackgroundColor',
  'compositeBackground',
  'compositeBorder',
  'compositeTitleBackground',
  'innerEndBackground',
  'specialStateColor',
];

const GANTT_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'sectionBkgColor',
  'sectionBkgColor2',
  'altSectionBkgColor',
  'gridColor',
  'todayLineColor',
  'taskBorderColor',
  'taskBkgColor',
  'taskTextColor',
  'activeTaskBorderColor',
  'activeTaskBkgColor',
  'doneTaskBorderColor',
  'doneTaskBkgColor',
  'critBorderColor',
  'critBkgColor',
  'excludeBkgColor',
];

const PIE_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'pie1',
  'pie2',
  'pie3',
  'pie4',
  'pie5',
  'pie6',
  'pie7',
  'pie8',
  'pie9',
  'pie10',
  'pie11',
  'pie12',
  'pieStrokeColor',
  'pieTitleTextColor',
  'pieSectionTextColor',
  'pieLegendTextColor',
];

const GIT_VARIABLES: (keyof MermaidThemeVariables)[] = [
  'git0',
  'git1',
  'git2',
  'git3',
  'git4',
  'git5',
  'git6',
  'git7',
  'commitLabelColor',
  'commitLabelBackground',
  'tagLabelColor',
  'tagLabelBackground',
  'tagLabelBorder',
];

describe('Theme Variable Coverage', () => {
  const flavors: FlavorExport[] = [latte, frappe, macchiato, mocha];

  for (const flavor of flavors) {
    describe(flavor.name, () => {
      it('has themeConfig with theme: "base"', () => {
        expect(flavor.themeConfig.theme).toBe('base');
      });

      it('has themeVariables property', () => {
        expect(flavor.themeVariables).toBeDefined();
        expect(typeof flavor.themeVariables).toBe('object');
      });

      it('has all core variables', () => {
        for (const varName of CORE_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all flowchart variables', () => {
        for (const varName of FLOWCHART_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all sequence diagram variables', () => {
        for (const varName of SEQUENCE_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all state diagram variables', () => {
        for (const varName of STATE_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all Gantt chart variables', () => {
        for (const varName of GANTT_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all pie chart variables (pie1-pie12)', () => {
        for (const varName of PIE_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });

      it('has all git graph variables (git0-git7)', () => {
        for (const varName of GIT_VARIABLES) {
          expect(flavor.themeVariables[varName]).toBeDefined();
        }
      });
    });
  }
});

describe('Theme Variable Values', () => {
  it('uses correct background color for each flavor', () => {
    expect(latte.themeVariables.background).toBe('#eff1f5');
    expect(frappe.themeVariables.background).toBe('#303446');
    expect(macchiato.themeVariables.background).toBe('#24273a');
    expect(mocha.themeVariables.background).toBe('#1e1e2e');
  });

  it('uses blue as primary color', () => {
    expect(latte.themeVariables.primaryColor).toBe('#1e66f5');
    expect(frappe.themeVariables.primaryColor).toBe('#8caaee');
    expect(macchiato.themeVariables.primaryColor).toBe('#8aadf4');
    expect(mocha.themeVariables.primaryColor).toBe('#89b4fa');
  });

  it('uses yellow for notes (semantic: highlights)', () => {
    expect(latte.themeVariables.noteBkgColor).toBe('#df8e1d');
    expect(frappe.themeVariables.noteBkgColor).toBe('#e5c890');
    expect(macchiato.themeVariables.noteBkgColor).toBe('#eed49f');
    expect(mocha.themeVariables.noteBkgColor).toBe('#f9e2af');
  });

  it('uses red for critical/error states (semantic: errors)', () => {
    expect(latte.themeVariables.todayLineColor).toBe('#d20f39');
    expect(frappe.themeVariables.todayLineColor).toBe('#e78284');
    expect(macchiato.themeVariables.todayLineColor).toBe('#ed8796');
    expect(mocha.themeVariables.todayLineColor).toBe('#f38ba8');
  });
});
