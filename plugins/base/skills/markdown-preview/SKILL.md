---
name: markdown-preview
description: Generate browser-viewable HTML previews from markdown, plain text, and Mermaid diagrams. Auto-validates diagrams, applies professional styling, and opens in default browser. Use when agents need to preview documentation, visualizations, or formatted content.
allowed-tools: Read, Write, Bash, Skill
---

# Markdown Preview Generator — Browser-Ready HTML from Markdown

Generate self-contained HTML files from markdown content and automatically open them in the user's default browser.

## What This Skill Does

- Accepts GitHub-flavored markdown, plain text, and Mermaid diagrams
- Validates all Mermaid diagrams in document at once (single validation pass)
- Generates single-page HTML with embedded libraries (marked.js, Prism.js, Mermaid.js)
- Applies professional styling (GitHub-style, dark mode, or minimal)
- Saves HTML to system temp directory with unique filename
- Auto-opens preview in default browser (cross-platform: macOS, Linux, Windows)
- Returns file path and execution status

## When to Use

Use this skill when you need to:
- Preview markdown documentation in a browser
- Visualize Mermaid diagrams with proper rendering
- Generate formatted HTML reports for users
- Display code blocks with syntax highlighting
- Create professional previews of generated content

**Trigger scenarios**: markdown preview, HTML generation, browser preview, document visualization, diagram rendering.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| **content** | string | Yes | - | Markdown, plain text, or Mermaid content to render |
| **title** | string | No | "Markdown Preview" | HTML page title |
| **theme** | string | No | "github" | Template theme: "github", "dark", or "minimal" |

## Workflow

### 1. Parse Input Content

Extract content from agent context or parameters. The skill expects markdown content as a string input.

### 2. Validate All Mermaid Diagrams (Single Pass)

**Efficient Validation Strategy**:

Instead of validating each diagram individually, validate the entire markdown document at once:

1. **Write markdown to temp file**:
   ```bash
   TEMP_MD=$(mktemp /tmp/markdown-preview.XXXXXX.md)
   echo "$CONTENT" > "$TEMP_MD"
   ```

2. **Validate all diagrams in one pass**:
   ```bash
   rp1 agent-tools mmd-validate "$TEMP_MD"
   EXIT_CODE=$?
   ```

3. **Check validation result**:
   - If `EXIT_CODE = 0`: All diagrams valid, proceed with generation
   - If `EXIT_CODE = 1`: One or more diagrams invalid

4. **Handle validation failures**:
   ```bash
   if [ $EXIT_CODE -ne 0 ]; then
       # Extract error message from validation output
       # Prepend warning to markdown content:
       CONTENT="⚠️ **Mermaid Validation Warning**: Some diagrams have syntax errors. They may not render correctly in the preview.\n\n$CONTENT"
       # Continue with HTML generation (non-blocking)
   fi
   ```

5. **Clean up temp file**:
   ```bash
   rm -f "$TEMP_MD"
   ```

**Why This Approach is Better**:
- ✅ **Single validation pass** instead of per-diagram validation
- ✅ **Faster**: Validates all diagrams in ~2-5 seconds total (not per diagram)
- ✅ **Uses CLI tool**: Leverages `rp1 agent-tools mmd-validate` for validation
- ✅ **Simpler logic**: No loops, no retry attempts
- ✅ **Non-blocking errors**: Invalid diagrams show in preview with Mermaid's own error rendering
- ✅ **Better user experience**: User sees actual diagram syntax errors in browser

**Error Handling**:
- Validation failures are **non-blocking** (HTML generation continues)
- Invalid diagrams render with Mermaid.js's built-in error display
- User can see exact syntax errors in browser preview
- Warning message prepended to document if validation fails

**Dependencies**:
- Requires rp1 CLI v0.3.0+ (includes `agent-tools mmd-validate` command)
- CLI tool supports markdown files with multiple Mermaid blocks

### 3. Generate Self-Contained HTML

**Template Selection**:

Based on `theme` parameter, select appropriate template from TEMPLATES.md:
- **"github"** (default): GitHub-style with professional appearance
- **"dark"**: Dark mode for late-night work or presentations
- **"minimal"**: Lightweight, print-friendly styling

**Template Loading**:
1. Read selected template from TEMPLATES.md
2. Identify template section markers
3. Extract complete HTML template

**Template Processing**:
1. Replace `{{TITLE}}` with actual page title
2. Replace `{{MARKDOWN_CONTENT}}` with markdown content
3. Ensure proper escaping of special characters in content

**HTML Features** (embedded in templates):
- **Libraries**: marked.js (markdown), Prism.js (syntax highlighting), Mermaid.js (diagrams)
- **Security**: Content Security Policy prevents XSS attacks
- **Styling**: Professional CSS embedded inline
- **Rendering**: Client-side JavaScript handles markdown parsing and diagram rendering
- **Error Display**: Mermaid.js automatically shows syntax errors for invalid diagrams
- **Languages**: Syntax highlighting for 10+ languages (Python, JavaScript, TypeScript, Bash, JSON, YAML, Rust, Go, Java, Markdown)

**See TEMPLATES.md** for complete HTML structure and styling details.

### 4. Write HTML to Temp Directory

**Filename Generation**:
```bash
TIMESTAMP=$(date +%s%N)
FILENAME="markdown-preview-${TIMESTAMP}.html"
TEMP_DIR="${TMPDIR:-/tmp}"
FILE_PATH="${TEMP_DIR}/${FILENAME}"
```

**File Operations**:
- Use Write tool to create HTML file
- Set file permissions to 600 (user-only readable) on Unix systems
- Return absolute file path

**Platform-specific temp directories**:
- macOS/Linux: `$TMPDIR` or `/tmp`
- Windows: `%TEMP%`

### 5. Open in Default Browser

**Platform Detection**:
```bash
# Detect platform via $OSTYPE
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
    OPEN_CMD="open"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
    OPEN_CMD="xdg-open"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    PLATFORM="windows"
    OPEN_CMD="start"
else
    PLATFORM="unknown"
    OPEN_CMD=""
fi
```

**Browser Opening**:
```bash
if [ -n "$OPEN_CMD" ]; then
    $OPEN_CMD "$FILE_PATH" 2>&1
    if [ $? -eq 0 ]; then
        BROWSER_OPENED=true
    else
        BROWSER_OPENED=false
        # Log error but continue (non-blocking)
    fi
else
    BROWSER_OPENED=false
    # Log warning: unknown platform
fi
```

**Error Handling**:
- If browser command fails: log error, set `browserOpened=false`, but still return success
- If platform unknown: log warning, return file path without opening browser
- Browser launch failure is non-blocking (file was still created successfully)

### 6. Return Results

**Output Format**:
```json
{
  "status": "success" | "error",
  "filePath": "/tmp/markdown-preview-1699464000000.html",
  "message": "Preview generated successfully.",
  "diagramsValidated": true,
  "browserOpened": true,
  "theme": "github"
}
```

**Success Response**:
- status: "success"
- filePath: Absolute path to generated HTML
- message: Human-readable summary
- diagramsValidated: Whether all Mermaid diagrams passed validation
- browserOpened: Whether browser was successfully launched
- theme: Selected template theme

**Error Response**:
```json
{
  "status": "error",
  "message": "Failed to write HTML file: Permission denied",
  "filePath": null,
  "diagramsValidated": false,
  "browserOpened": false
}
```

## Error Handling

**Empty/Whitespace Input**:
- Render empty HTML gracefully
- Do not fail

**File Write Errors**:
- Return error status with system error message
- Check file system permissions
- Suggest temp directory access issues

**Validation Script Unavailable**:
- Log warning: "Mermaid validation script not found. Diagrams not pre-validated."
- Continue with HTML generation (non-blocking)
- Mermaid.js will show errors in browser if diagrams invalid

**Browser Launch Failures** (non-blocking):
- Log error message
- Set browserOpened = false
- Return success with file path
- User can manually open file

**Malformed Markdown** (best-effort):
- marked.js handles malformed markdown gracefully
- Render as best as possible
- Do not fail on non-standard syntax
- Log warnings but continue generation

**Invalid Theme**:
- Fall back to "github" theme
- Log warning about invalid theme parameter

**Invalid Mermaid Diagrams** (non-blocking):
- Validation warning prepended to document
- Mermaid.js renders error messages in browser
- User sees exact syntax errors
- Can inspect and fix diagrams in source

## Integration Example

**From PR Visualizer Agent**:
```markdown
## Generate HTML Preview

After creating the markdown file, use the markdown-preview skill to generate the HTML preview.

Use the Skill tool:

skill: "rp1-base:markdown-preview"

Read the generated markdown file and pass content:
- content: Read from {RP1_ROOT}/work/pr_reviews/<pr-id>-visual.md
- title: "PR Visualization for PR #{pr-number}"
- theme: "github"

The skill will:
1. Write markdown to temp file
2. Validate ALL Mermaid diagrams in one pass using rp1 CLI tool
3. Generate self-contained HTML with professional styling
4. Save to temp directory
5. Auto-open in browser
6. Return file path for logging

Log the file path and report to user:
"✓ Preview generated: {filePath}"
```

**From Documentation Agent**:
```markdown
Use skill: "rp1-base:markdown-preview"

Pass documentation content:
- content: Generated markdown documentation
- title: "Project Documentation"
- theme: "github"

Skill validates all diagrams once and generates HTML.
Browser opens automatically.
```

## Performance Expectations

**Optimized Performance** (<5 seconds total):
- Input parsing: <100ms
- Mermaid validation (all diagrams): ~2-3s (single pass)
- HTML generation: <500ms
- File write: <100ms
- Browser launch: <2s

**Typical Content**:
- 5,000-10,000 characters of markdown
- 2-5 Mermaid diagrams (validated together)
- 5-10 code blocks with syntax highlighting

**Performance Improvement**:
- **Before**: 1-3 seconds PER diagram (4 diagrams = 4-12 seconds)
- **After**: 2-3 seconds for ALL diagrams (constant time)
- **Speedup**: ~60-75% faster for documents with multiple diagrams

## Dependencies

**Internal**:
- rp1 CLI v0.3.0+ (for bulk diagram validation via `agent-tools mmd-validate`)

**External** (embedded via CDN):
- marked.js (markdown parsing)
- Prism.js (syntax highlighting)
- Mermaid.js (diagram rendering)

**System Requirements**:
- Write access to temp directory
- Default browser configured
- Bash tool access for platform detection and browser opening

## Business Rules

1. **Single-Pass Validation**: All Mermaid diagrams validated together in one script call
2. **Non-Blocking Errors**: Invalid diagrams don't prevent HTML generation
3. **Browser-Side Error Display**: Mermaid.js shows syntax errors in preview
4. **Browser Launch is Non-Blocking**: File creation always succeeds; browser opening is best-effort
5. **Self-Contained Output**: HTML file contains all resources (CSS inline, JS via CDN)
6. **Best-Effort Rendering**: Never fail due to malformed markdown; render as best as possible
7. **Theme Fallback**: Invalid theme parameter defaults to "github"
8. **Validation Tool Optional**: If rp1 CLI validation unavailable, continue without pre-validation

## References

- **TEMPLATES.md**: Complete HTML templates with CSS variations (GitHub-style, dark mode, minimal)
- **EXAMPLES.md**: Practical input/output examples demonstrating all features

## Anti-Loop Directives

**EXECUTE IMMEDIATELY**:
- Do NOT propose plans or ask for approval
- Do NOT iterate or refine output
- Execute workflow ONCE from start to finish
- Generate complete HTML and open browser
- Return results and STOP

No user interaction required during execution. Complete the entire workflow autonomously.
