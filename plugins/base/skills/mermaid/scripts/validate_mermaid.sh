#!/bin/bash

# Mermaid Diagram Validation Script
# Supports: stdin, single diagram files (.mmd), and markdown files with embedded diagrams
# Enhanced with structured JSON output and error category detection

set -o pipefail

# Colors for output (used in non-JSON mode)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
TOTAL=0

# Output mode
JSON_MODE=0

# Error categories with their detection patterns
# Categories: ARROW_SYNTAX, QUOTE_ERROR, CARDINALITY, LINE_BREAK, DIAGRAM_TYPE, NODE_SYNTAX, UNKNOWN

# Function to detect error category from mermaid-cli error message
detect_error_category() {
  local error_text="$1"

  # ARROW_SYNTAX: Invalid arrow syntax (e.g., -> instead of --> in certain diagrams)
  # Check for MINUS token errors (common when using -> instead of -->)
  # Also check for LINK or START_LINK errors which indicate arrow issues
  if echo "$error_text" | grep -qiE "got 'MINUS'|got 'GT'|expecting.*LINK|expecting.*START_LINK"; then
    echo "ARROW_SYNTAX"
    return
  fi
  if echo "$error_text" | grep -qiE "(invalid|unexpected).*(arrow|->|-->|--|==>)|arrow.*syntax|expecting.*-->"; then
    echo "ARROW_SYNTAX"
    return
  fi

  # QUOTE_ERROR: Unquoted labels or string issues
  if echo "$error_text" | grep -qiE "unterminated string|quote|unquoted|unexpected (string|character).*['\"]|lexical error.*string|got 'STR'"; then
    echo "QUOTE_ERROR"
    return
  fi

  # CARDINALITY: ER diagram relationship syntax errors
  if echo "$error_text" | grep -qiE "cardinality|relationship|entity.*relationship|\|\|--o\{|\}o--\|\||ER diagram|erDiagram"; then
    echo "CARDINALITY"
    return
  fi

  # LINE_BREAK: Missing newlines or improper line structure
  if echo "$error_text" | grep -qiE "expecting.*(NEWLINE|NL|EOF)|newline|line break|unexpected.*end|multiple statements"; then
    echo "LINE_BREAK"
    return
  fi

  # DIAGRAM_TYPE: Invalid or unknown diagram type declaration
  if echo "$error_text" | grep -qiE "unknown diagram type|invalid diagram|unrecognized diagram|expecting.*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey)|no diagram type|UnknownDiagramError"; then
    echo "DIAGRAM_TYPE"
    return
  fi

  # NODE_SYNTAX: Malformed node definitions (brackets, braces, parentheses)
  if echo "$error_text" | grep -qiE "node.*syntax|malformed node|unclosed (bracket|brace|paren)|unexpected.*[\[\]{}()]|bracket.*mismatch|unbalanced|undefined.*node|got 'PS'|got 'PE'|got 'SQS'|got 'SQE'"; then
    echo "NODE_SYNTAX"
    return
  fi

  # Additional pattern matching for common mermaid-cli errors
  if echo "$error_text" | grep -qiE "Parse error|Syntax error|Lexical error"; then
    # Try to infer category from arrow patterns in the error context
    if echo "$error_text" | grep -qE " -> | --> |--|==>"; then
      echo "ARROW_SYNTAX"
      return
    fi
    if echo "$error_text" | grep -qE "\[|\]|\{|\}|\(|\)"; then
      echo "NODE_SYNTAX"
      return
    fi
  fi

  echo "UNKNOWN"
}

# Function to extract line number from error message
extract_error_line() {
  local error_text="$1"

  # Common patterns for line numbers in mermaid-cli errors:
  # "Parse error on line 3"
  # "Error: Parse error on line 5:"
  # "line 10: unexpected token"
  # "(3:10)" or "line 3, column 10"

  local line_num=""

  # Pattern: "on line N"
  line_num=$(echo "$error_text" | grep -oE "on line [0-9]+" | head -1 | grep -oE "[0-9]+")
  if [[ -n "$line_num" ]]; then
    echo "$line_num"
    return
  fi

  # Pattern: "line N:" or "line N,"
  line_num=$(echo "$error_text" | grep -oE "line [0-9]+" | head -1 | grep -oE "[0-9]+")
  if [[ -n "$line_num" ]]; then
    echo "$line_num"
    return
  fi

  # Pattern: "(N:M)" for line:column
  line_num=$(echo "$error_text" | grep -oE "\([0-9]+:[0-9]+\)" | head -1 | sed 's/[()]//g' | cut -d: -f1)
  if [[ -n "$line_num" ]]; then
    echo "$line_num"
    return
  fi

  # Pattern: "at N:M" for line:column
  line_num=$(echo "$error_text" | grep -oE "at [0-9]+:[0-9]+" | head -1 | grep -oE "[0-9]+" | head -1)
  if [[ -n "$line_num" ]]; then
    echo "$line_num"
    return
  fi

  echo ""
}

# Function to extract error context (the problematic code snippet)
extract_error_context() {
  local error_text="$1"
  local diagram_content="$2"
  local error_line="$3"

  # Try to get context from error message first
  # Look for quoted code snippets
  local context=""
  context=$(echo "$error_text" | grep -oE "'[^']+'" | head -1 | sed "s/'//g")

  if [[ -n "$context" && ${#context} -lt 100 ]]; then
    echo "$context"
    return
  fi

  # If we have a line number, extract that line from the diagram
  if [[ -n "$error_line" && -n "$diagram_content" ]]; then
    context=$(echo "$diagram_content" | sed -n "${error_line}p" | head -c 100)
    if [[ -n "$context" ]]; then
      echo "$context"
      return
    fi
  fi

  # Fall back to first non-empty line of error
  context=$(echo "$error_text" | grep -v "^$" | head -1 | head -c 100)
  echo "$context"
}

# Function to escape string for JSON
json_escape() {
  local string="$1"
  # Escape backslashes, quotes, newlines, tabs, and other control characters
  echo -n "$string" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ' | tr '\r' ' '
}

# Function to output JSON result for a single diagram
output_json_result() {
  local valid="$1"
  local diagram_index="$2"
  local markdown_line="$3"
  local raw_error="$4"
  local error_line="$5"
  local error_category="$6"
  local error_context="$7"

  local escaped_raw=$(json_escape "$raw_error")
  local escaped_context=$(json_escape "$error_context")

  if [[ "$valid" == "true" ]]; then
    cat <<EOF
{
  "valid": true,
  "diagram_index": $diagram_index,
  "markdown_line": $markdown_line
}
EOF
  else
    cat <<EOF
{
  "valid": false,
  "diagram_index": $diagram_index,
  "markdown_line": $markdown_line,
  "error": {
    "raw": "$escaped_raw",
    "line": ${error_line:-null},
    "category": "$error_category",
    "context": "$escaped_context"
  }
}
EOF
  fi
}

# Function to validate a single diagram string
# Returns: 0 for valid, 1 for invalid
# Outputs: JSON or colored text based on mode
validate_diagram_string() {
  local diagram_content="$1"
  local diagram_label="$2"
  local diagram_index="${3:-1}"
  local markdown_line="${4:-0}"

  # Create temp files
  local temp_diagram=$(mktemp /tmp/mermaid.XXXXXX.mmd)
  local temp_output=$(mktemp /tmp/mermaid.XXXXXX.svg)
  local temp_errors=$(mktemp /tmp/mermaid.XXXXXX.txt)

  # Write diagram to temp file
  echo "$diagram_content" > "$temp_diagram"

  # Run mermaid-cli validation
  local exit_code=0
  npx -y @mermaid-js/mermaid-cli@latest -i "$temp_diagram" -o "$temp_output" -q > "$temp_errors" 2>&1 || exit_code=$?

  # Capture error output
  local error_output=$(cat "$temp_errors")

  # Check validation result
  if [[ $exit_code -eq 0 && -f "$temp_output" && -s "$temp_output" ]]; then
    # Valid diagram
    if [[ $JSON_MODE -eq 1 ]]; then
      output_json_result "true" "$diagram_index" "$markdown_line" "" "" "" ""
    else
      echo -e "${GREEN}PASS${NC} $diagram_label: Valid"
    fi
    rm -f "$temp_diagram" "$temp_output" "$temp_errors"
    return 0
  else
    # Invalid diagram - parse error details
    local error_line=$(extract_error_line "$error_output")
    local error_category=$(detect_error_category "$error_output")
    local error_context=$(extract_error_context "$error_output" "$diagram_content" "$error_line")

    # If no line number found but output file not generated, set to 1
    if [[ -z "$error_line" ]]; then
      error_line="null"
    fi

    if [[ $JSON_MODE -eq 1 ]]; then
      output_json_result "false" "$diagram_index" "$markdown_line" "$error_output" "$error_line" "$error_category" "$error_context"
    else
      echo -e "${RED}FAIL${NC} $diagram_label: Invalid"
      echo "  Category: $error_category"
      if [[ "$error_line" != "null" ]]; then
        echo "  Error Line: $error_line"
      fi
      echo "  Error: $error_output"
    fi
    rm -f "$temp_diagram" "$temp_output" "$temp_errors"
    return 1
  fi
}

# Function to extract and validate diagrams from markdown
# Tracks line numbers for each diagram block
validate_markdown_diagrams() {
  local markdown_file="$1"

  if [[ $JSON_MODE -eq 0 ]]; then
    echo -e "${YELLOW}Validating Mermaid diagrams in: $markdown_file${NC}"
    echo
  fi

  # JSON array accumulator for JSON mode
  local json_results="["
  local first_result=1

  # Extract all mermaid code blocks with line numbers
  local diagram_num=0
  local in_mermaid=0
  local current_diagram=""
  local diagram_start_line=0
  local line_num=0

  while IFS= read -r line; do
    ((line_num++))

    if [[ "$line" =~ ^\`\`\`mermaid ]]; then
      in_mermaid=1
      current_diagram=""
      ((diagram_num++))
      diagram_start_line=$line_num
    elif [[ "$line" =~ ^\`\`\`$ ]] && [[ $in_mermaid -eq 1 ]]; then
      in_mermaid=0
      ((TOTAL++))

      if [[ $JSON_MODE -eq 1 ]]; then
        # Capture JSON output
        local result=$(validate_diagram_string "$current_diagram" "Diagram $diagram_num" "$diagram_num" "$diagram_start_line")
        if [[ $first_result -eq 1 ]]; then
          json_results="${json_results}${result}"
          first_result=0
        else
          json_results="${json_results},${result}"
        fi

        # Check if valid for counting
        if echo "$result" | grep -q '"valid": true'; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
      else
        if validate_diagram_string "$current_diagram" "Diagram $diagram_num (line $diagram_start_line)" "$diagram_num" "$diagram_start_line"; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
        echo
      fi
    elif [[ $in_mermaid -eq 1 ]]; then
      current_diagram="${current_diagram}${line}"$'\n'
    fi
  done < "$markdown_file"

  if [[ $diagram_num -eq 0 ]]; then
    if [[ $JSON_MODE -eq 1 ]]; then
      echo '{"valid": true, "diagram_index": 0, "markdown_line": 0, "message": "No mermaid diagrams found"}'
    else
      echo -e "${YELLOW}WARNING${NC} No Mermaid diagrams found in $markdown_file"
    fi
    return 1
  fi

  # Output JSON array for JSON mode
  if [[ $JSON_MODE -eq 1 ]]; then
    json_results="${json_results}]"
    echo "$json_results"
  fi
}

# Function to show usage
show_usage() {
  echo "Mermaid Diagram Validation Script"
  echo ""
  echo "Usage: $0 [OPTIONS] <file.mmd|file.md>"
  echo "   or: echo 'diagram' | $0 [OPTIONS]"
  echo "   or: $0 [OPTIONS] <<< 'diagram'"
  echo ""
  echo "Options:"
  echo "  --json       Output results in structured JSON format"
  echo "  -j           Short form of --json"
  echo "  -h, --help   Show this help message"
  echo ""
  echo "Output Modes:"
  echo "  Default: Colored text output with PASS/FAIL indicators"
  echo "  JSON:    Structured JSON with error details and categories"
  echo ""
  echo "Error Categories (detected in JSON mode):"
  echo "  ARROW_SYNTAX   - Invalid arrow syntax (e.g., -> vs -->)"
  echo "  QUOTE_ERROR    - Unquoted labels or string issues"
  echo "  CARDINALITY    - ER diagram relationship syntax errors"
  echo "  LINE_BREAK     - Missing newlines or improper line structure"
  echo "  DIAGRAM_TYPE   - Invalid or unknown diagram type"
  echo "  NODE_SYNTAX    - Malformed node definitions"
  echo "  UNKNOWN        - Error doesn't match known patterns"
  echo ""
  echo "JSON Output Format:"
  echo '  {"valid": bool, "diagram_index": N, "markdown_line": N,'
  echo '   "error": {"raw": "...", "line": N, "category": "...", "context": "..."}}'
}

# Main logic
main() {
  # Parse arguments
  local input_file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json|-j)
        JSON_MODE=1
        shift
        ;;
      -h|--help)
        show_usage
        exit 0
        ;;
      -*)
        echo "Unknown option: $1"
        show_usage
        exit 1
        ;;
      *)
        input_file="$1"
        shift
        ;;
    esac
  done

  # Check if input is from stdin or file
  # Only read from stdin if there's no file argument AND stdin is available
  if [[ -z "$input_file" ]] && { [[ -p /dev/stdin ]] || [[ ! -t 0 ]]; }; then
    # Input from stdin
    local diagram_content=$(cat)
    ((TOTAL++))

    if [[ $JSON_MODE -eq 1 ]]; then
      local result=$(validate_diagram_string "$diagram_content" "stdin" "1" "0")
      echo "$result"
      if echo "$result" | grep -q '"valid": true'; then
        ((PASSED++))
        exit 0
      else
        ((FAILED++))
        exit 1
      fi
    else
      if validate_diagram_string "$diagram_content" "stdin" "1" "0"; then
        ((PASSED++))
        exit 0
      else
        ((FAILED++))
        exit 1
      fi
    fi
  elif [[ -z "$input_file" ]]; then
    show_usage
    exit 1
  else
    # Input from file
    if [[ ! -f "$input_file" ]]; then
      if [[ $JSON_MODE -eq 1 ]]; then
        echo '{"valid": false, "diagram_index": 0, "markdown_line": 0, "error": {"raw": "File not found: '"$input_file"'", "line": null, "category": "UNKNOWN", "context": ""}}'
      else
        echo -e "${RED}ERROR${NC} File not found: $input_file"
      fi
      exit 1
    fi

    # Determine file type and validate accordingly
    if [[ "$input_file" =~ \.md$ ]]; then
      # Markdown file - extract and validate all diagrams
      validate_markdown_diagrams "$input_file"
    elif [[ "$input_file" =~ \.(mmd|mermaid)$ ]]; then
      # Single diagram file
      local diagram_content=$(cat "$input_file")
      ((TOTAL++))

      if [[ $JSON_MODE -eq 1 ]]; then
        local result=$(validate_diagram_string "$diagram_content" "$(basename "$input_file")" "1" "1")
        echo "$result"
        if echo "$result" | grep -q '"valid": true'; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
      else
        if validate_diagram_string "$diagram_content" "$(basename "$input_file")" "1" "1"; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
      fi
    else
      if [[ $JSON_MODE -eq 0 ]]; then
        echo -e "${YELLOW}WARNING${NC} Unknown file type. Treating as single diagram."
      fi
      local diagram_content=$(cat "$input_file")
      ((TOTAL++))

      if [[ $JSON_MODE -eq 1 ]]; then
        local result=$(validate_diagram_string "$diagram_content" "$(basename "$input_file")" "1" "1")
        echo "$result"
        if echo "$result" | grep -q '"valid": true'; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
      else
        if validate_diagram_string "$diagram_content" "$(basename "$input_file")" "1" "1"; then
          ((PASSED++))
        else
          ((FAILED++))
        fi
      fi
    fi
  fi

  # Print summary if multiple diagrams (non-JSON mode only)
  if [[ $JSON_MODE -eq 0 && $TOTAL -gt 1 ]]; then
    echo "================================"
    echo "Validation Summary"
    echo "================================"
    echo -e "Total:  $TOTAL"
    echo -e "${GREEN}Passed: $PASSED${NC}"
    echo -e "${RED}Failed: $FAILED${NC}"
    echo "================================"
  fi

  # Exit with appropriate code
  if [[ $FAILED -gt 0 ]]; then
    exit 1
  else
    exit 0
  fi
}

# Run main function
main "$@"
