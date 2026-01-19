#!/usr/bin/env bun
/**
 * YAML Validation Script for prompt-eval-builder skill
 *
 * Validates YAML files and outputs JSON result.
 *
 * Usage: cd <repo>/cli && bun run <script-path> <file-path>
 *
 * Output (JSON to stdout):
 *   - Success: { "valid": true }
 *   - Failure: { "valid": false, "error": "message" }
 *
 * Exit codes:
 *   - 0: Valid YAML
 *   - 1: Invalid YAML or error
 *
 * Requires: Run from cli directory to resolve yaml package from cli/node_modules
 *
 * Alternative (no external deps):
 *   bun -e "import {parse} from 'yaml'; import {readFileSync} from 'fs'; try { parse(readFileSync('$FILE','utf8')); console.log(JSON.stringify({valid:true})) } catch(e) { console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1) }"
 */

import { readFileSync } from 'fs';
import { parse } from 'yaml';

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateYaml(filePath: string): ValidationResult {
  try {
    const content = readFileSync(filePath, 'utf8');

    if (content.includes('\t')) {
      return {
        valid: false,
        error: 'YAML contains tabs. Use spaces for indentation.',
      };
    }

    if (content.trim().startsWith('```')) {
      return {
        valid: false,
        error: 'YAML must not be wrapped in code fences. Remove ``` markers.',
      };
    }

    parse(content);

    return { valid: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      error: errorMessage,
    };
  }
}

function main(): void {
  const filePath = process.argv[2];

  if (!filePath) {
    console.log(JSON.stringify({ valid: false, error: 'No file path provided' }));
    process.exit(1);
  }

  const result = validateYaml(filePath);
  console.log(JSON.stringify(result));
  process.exit(result.valid ? 0 : 1);
}

main();
