#!/bin/sh
set -eu

# rp1 Binary Smoke Tests
# Run after installation to verify the binary works correctly
# Usage: ./scripts/smoke-test.sh [rp1-binary-path]

# Colors (only if terminal supports it)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BOLD=''
    NC=''
fi

# Use provided path or default to 'rp1'
RR1_BIN="${1:-rp1}"

passed=0
failed=0

pass() {
    printf "${GREEN}✓${NC} %s\n" "$1"
    passed=$((passed + 1))
}

fail() {
    printf "${RED}✗${NC} %s\n" "$1"
    failed=$((failed + 1))
}

echo ""
printf "${BOLD}rp1 Smoke Tests${NC}\n"
echo "================"
echo ""
printf "Testing binary: ${BOLD}%s${NC}\n" "$RR1_BIN"
echo ""

# Test 1: Binary exists and is executable
if command -v "$RR1_BIN" >/dev/null 2>&1 || [ -x "$RR1_BIN" ]; then
    pass "Binary is executable"
else
    fail "Binary not found or not executable"
    echo ""
    printf "${RED}Cannot continue tests - binary not found${NC}\n"
    exit 1
fi

# Test 2: Version output
VERSION=$("$RR1_BIN" --version 2>/dev/null || echo "")
if echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
    pass "Version output: $VERSION"
else
    fail "Version output invalid or missing"
fi

# Test 3: Help output
if "$RR1_BIN" --help 2>/dev/null | grep -q "AI-assisted development workflows"; then
    pass "Help output contains description"
else
    fail "Help output missing or incorrect"
fi

# Test 4: Build command available
if "$RR1_BIN" build --help >/dev/null 2>&1; then
    pass "Command 'build' available"
else
    fail "Command 'build' not available"
fi

# Test 5: Install command available
if "$RR1_BIN" install --help >/dev/null 2>&1; then
    pass "Command 'install' available"
else
    fail "Command 'install' not available"
fi

# Test 6: Init command available
if "$RR1_BIN" init --help >/dev/null 2>&1; then
    pass "Command 'init' available"
else
    fail "Command 'init' not available"
fi

# Test 7: Verify command available
if "$RR1_BIN" verify --help >/dev/null 2>&1; then
    pass "Command 'verify' available"
else
    fail "Command 'verify' not available"
fi

# Test 8: Startup time (should be under 500ms)
# Note: This is a basic check, not precise timing
START_TIME=$(date +%s%N 2>/dev/null || date +%s)
"$RR1_BIN" --version >/dev/null 2>&1
END_TIME=$(date +%s%N 2>/dev/null || date +%s)

if [ "$START_TIME" != "$END_TIME" ]; then
    # If nanoseconds available, check < 500ms
    DIFF=$((END_TIME - START_TIME))
    if [ "$DIFF" -lt 500000000 ]; then
        pass "Startup time acceptable (<500ms)"
    else
        printf "${YELLOW}⚠${NC} Startup time may be slow\n"
    fi
else
    # Can't measure precisely, assume OK
    pass "Startup time check (imprecise)"
fi

# Summary
echo ""
echo "================"
printf "${BOLD}Results:${NC} ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" "$passed" "$failed"
echo ""

if [ "$failed" -gt 0 ]; then
    printf "${RED}Some tests failed!${NC}\n"
    exit 1
else
    printf "${GREEN}All smoke tests passed!${NC}\n"
    exit 0
fi
