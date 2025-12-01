#!/bin/bash

# Mermaid Diagram Validation Script
# Supports: stdin, single diagram files (.mmd), and markdown files with embedded diagrams

set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
TOTAL=0

# Function to validate a single diagram string
validate_diagram_string() {
  local diagram_content="$1"
  local diagram_label="$2"

  # Create temp file for diagram
  local temp_diagram=$(mktemp /tmp/mermaid.XXXXXX.mmd)
  local temp_output=$(mktemp /tmp/mermaid.XXXXXX.svg)
  local temp_errors=$(mktemp /tmp/mermaid.XXXXXX.txt)

  # Write diagram to temp file
  echo "$diagram_content" > "$temp_diagram"

  # Run mermaid-cli validation
  if npx -y @mermaid-js/mermaid-cli@latest -i "$temp_diagram" -o "$temp_output" -q > "$temp_errors" 2>&1; then
    # Check if output file was created successfully
    if [[ -f "$temp_output" && -s "$temp_output" ]]; then
      echo -e "${GREEN}✅ $diagram_label: Valid${NC}"
      rm -f "$temp_diagram" "$temp_output" "$temp_errors"
      return 0
    else
      echo -e "${RED}❌ $diagram_label: Invalid${NC} - Output file not generated"
      cat "$temp_errors"
      rm -f "$temp_diagram" "$temp_output" "$temp_errors"
      return 1
    fi
  else
    # Command failed
    echo -e "${RED}❌ $diagram_label: Invalid${NC}"
    cat "$temp_errors"
    rm -f "$temp_diagram" "$temp_output" "$temp_errors"
    return 1
  fi
}

# Function to extract and validate diagrams from markdown
validate_markdown_diagrams() {
  local markdown_file="$1"

  echo -e "${YELLOW}Validating Mermaid diagrams in: $markdown_file${NC}"
  echo

  # Extract all mermaid code blocks
  local diagram_num=0
  local in_mermaid=0
  local current_diagram=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^\`\`\`mermaid ]]; then
      in_mermaid=1
      current_diagram=""
      ((diagram_num++))
    elif [[ "$line" =~ ^\`\`\`$ ]] && [[ $in_mermaid -eq 1 ]]; then
      in_mermaid=0
      ((TOTAL++))
      if validate_diagram_string "$current_diagram" "Diagram $diagram_num"; then
        ((PASSED++))
      else
        ((FAILED++))
      fi
      echo
    elif [[ $in_mermaid -eq 1 ]]; then
      current_diagram="${current_diagram}${line}"$'\n'
    fi
  done < "$markdown_file"

  if [[ $diagram_num -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No Mermaid diagrams found in $markdown_file${NC}"
    return 1
  fi
}

# Main logic
main() {
  # Check if input is from stdin or file
  if [[ -p /dev/stdin ]] || [[ ! -t 0 ]]; then
    # Input from stdin
    local diagram_content=$(cat)
    ((TOTAL++))
    if validate_diagram_string "$diagram_content" "Diagram stdin"; then
      ((PASSED++))
      exit 0
    else
      ((FAILED++))
      exit 1
    fi
  elif [[ $# -eq 0 ]]; then
    echo "Usage: $0 <file.mmd|file.md>"
    echo "   or: echo 'diagram' | $0"
    echo "   or: $0 <<< 'diagram'"
    exit 1
  else
    # Input from file
    local input_file="$1"

    if [[ ! -f "$input_file" ]]; then
      echo -e "${RED}❌ File not found: $input_file${NC}"
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
      if validate_diagram_string "$diagram_content" "Diagram $(basename "$input_file")"; then
        ((PASSED++))
      else
        ((FAILED++))
      fi
    else
      echo -e "${YELLOW}⚠️  Unknown file type. Treating as single diagram.${NC}"
      local diagram_content=$(cat "$input_file")
      ((TOTAL++))
      if validate_diagram_string "$diagram_content" "Diagram $(basename "$input_file")"; then
        ((PASSED++))
      else
        ((FAILED++))
      fi
    fi
  fi

  # Print summary if multiple diagrams
  if [[ $TOTAL -gt 1 ]]; then
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
