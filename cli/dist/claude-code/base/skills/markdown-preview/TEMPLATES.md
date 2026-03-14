# HTML Templates for Markdown Preview

This file contains HTML templates used by the markdown-preview skill to generate browser-viewable previews.

## Template Structure

All templates follow this structure:
- Self-contained HTML5 document
- Embedded CSS for styling
- CDN-loaded libraries (marked.js, Prism.js, Mermaid.js)
- Client-side rendering with error handling
- Content Security Policy for XSS prevention

## Default Template (GitHub-Style)

This is the primary template used for most previews. It provides GitHub-flavored styling with professional appearance.

**Usage**: Default for all markdown preview generation.

**Features**:
- GitHub-style typography and colors
- Syntax highlighting for 10+ languages
- Mermaid diagram support
- Responsive layout (max-width 900px)
- Clean, readable design

**Template**:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self';
                   script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
                   style-src 'unsafe-inline' https://cdn.jsdelivr.net;
                   img-src 'self' data:;">
    <title>{{TITLE}}</title>

    <!-- CDN Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/prismjs/prism.min.js"></script>
    <!-- Prism language components -->
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-python.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-javascript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-typescript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-bash.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-json.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-markdown.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-yaml.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-rust.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-go.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-java.min.js"></script>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        window.mermaid = mermaid;
    </script>

    <!-- GitHub-Style CSS -->
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px;
            line-height: 1.6;
            color: #24292e;
            background: #ffffff;
        }
        pre {
            background: #f6f8fa;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            border: 1px solid #e1e4e8;
        }
        code {
            background: #f6f8fa;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 85%;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        .mermaid {
            margin: 20px 0;
            display: flex;
            justify-content: center;
        }
        h1, h2, h3 {
            border-bottom: 1px solid #eaecef;
            padding-bottom: 8px;
            margin-top: 24px;
            margin-bottom: 16px;
        }
        h1 {
            font-size: 2em;
            font-weight: 600;
        }
        h2 {
            font-size: 1.5em;
            font-weight: 600;
        }
        h3 {
            font-size: 1.25em;
            font-weight: 600;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }
        table th, table td {
            padding: 8px 12px;
            border: 1px solid #e1e4e8;
        }
        table th {
            background: #f6f8fa;
            font-weight: 600;
        }
        table tr:nth-child(even) {
            background: #f6f8fa;
        }
        blockquote {
            border-left: 4px solid #dfe2e5;
            padding: 0 16px;
            color: #6a737d;
            margin: 0;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        hr {
            border: 0;
            border-top: 1px solid #e1e4e8;
            margin: 24px 0;
        }
    </style>
</head>
<body>
    <script type="text/plain" id="markdown-source">
{{MARKDOWN_CONTENT}}
    </script>
    <div id="content">Loading...</div>

    <!-- Client-side rendering -->
    <script>
        document.addEventListener('DOMContentLoaded', async function() {
            try {
                const markdownSource = document.getElementById('markdown-source').textContent;
                const contentDiv = document.getElementById('content');

                // Parse markdown with marked.js
                marked.setOptions({
                    gfm: true,
                    breaks: true,
                    headerIds: true
                });
                const htmlContent = marked.parse(markdownSource);
                contentDiv.innerHTML = htmlContent;

                // Convert code blocks with language-mermaid class to mermaid divs
                const mermaidBlocks = contentDiv.querySelectorAll('code.language-mermaid');
                mermaidBlocks.forEach(block => {
                    const pre = block.parentElement;
                    const div = document.createElement('div');
                    div.className = 'mermaid';
                    div.textContent = block.textContent;
                    pre.replaceWith(div);
                });

                // Render Mermaid diagrams
                if (window.mermaid) {
                    await window.mermaid.run({ querySelector: '.mermaid' });
                }

                // Highlight code blocks
                if (window.Prism) {
                    Prism.highlightAll();
                }
            } catch (error) {
                document.getElementById('content').innerHTML =
                    '<p style="color: red;">Error rendering: ' + error.message + '</p>';
            }
        });
    </script>
</body>
</html>
```

**Placeholders**:
- `{{TITLE}}`: Replace with page title (e.g., "Markdown Preview", "PR Visualization")
- `{{MARKDOWN_CONTENT}}`: Replace with markdown content (diagrams already validated/fixed)

## Dark Mode Template

Alternative template for dark mode viewing. Useful for late-night work or presentations.

**Usage**: Optional, can be selected for specific use cases.

**Template**:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self';
                   script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
                   style-src 'unsafe-inline' https://cdn.jsdelivr.net;
                   img-src 'self' data:;">
    <title>{{TITLE}}</title>

    <!-- CDN Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism-tomorrow.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/prismjs/prism.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-python.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-javascript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-typescript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-bash.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-json.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs/components/prism-markdown.min.js"></script>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        window.mermaid = mermaid;
    </script>

    <!-- Dark Mode CSS -->
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px;
            line-height: 1.6;
            color: #c9d1d9;
            background: #0d1117;
        }
        pre {
            background: #161b22;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            border: 1px solid #30363d;
        }
        code {
            background: #161b22;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 85%;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            color: #c9d1d9;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        .mermaid {
            margin: 20px 0;
            display: flex;
            justify-content: center;
        }
        h1, h2, h3 {
            border-bottom: 1px solid #21262d;
            padding-bottom: 8px;
            margin-top: 24px;
            margin-bottom: 16px;
            color: #c9d1d9;
        }
        h1 {
            font-size: 2em;
            font-weight: 600;
        }
        h2 {
            font-size: 1.5em;
            font-weight: 600;
        }
        h3 {
            font-size: 1.25em;
            font-weight: 600;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }
        table th, table td {
            padding: 8px 12px;
            border: 1px solid #30363d;
        }
        table th {
            background: #161b22;
            font-weight: 600;
        }
        table tr:nth-child(even) {
            background: #161b22;
        }
        blockquote {
            border-left: 4px solid #30363d;
            padding: 0 16px;
            color: #8b949e;
            margin: 0;
        }
        a {
            color: #58a6ff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        hr {
            border: 0;
            border-top: 1px solid #21262d;
            margin: 24px 0;
        }
    </style>
</head>
<body>
    <script type="text/plain" id="markdown-source">
{{MARKDOWN_CONTENT}}
    </script>
    <div id="content">Loading...</div>

    <script>
        document.addEventListener('DOMContentLoaded', async function() {
            try {
                const markdownSource = document.getElementById('markdown-source').textContent;
                const contentDiv = document.getElementById('content');

                marked.setOptions({
                    gfm: true,
                    breaks: true,
                    headerIds: true
                });
                const htmlContent = marked.parse(markdownSource);
                contentDiv.innerHTML = htmlContent;

                const mermaidBlocks = contentDiv.querySelectorAll('code.language-mermaid');
                mermaidBlocks.forEach(block => {
                    const pre = block.parentElement;
                    const div = document.createElement('div');
                    div.className = 'mermaid';
                    div.textContent = block.textContent;
                    pre.replaceWith(div);
                });

                if (window.mermaid) {
                    await window.mermaid.run({ querySelector: '.mermaid' });
                }

                if (window.Prism) {
                    Prism.highlightAll();
                }
            } catch (error) {
                document.getElementById('content').innerHTML =
                    '<p style="color: #f85149;">Error rendering: ' + error.message + '</p>';
            }
        });
    </script>
</body>
</html>
```

## Minimal Template

Lightweight template with minimal styling. Good for simple documents or printing.

**Usage**: When users want clean, distraction-free output.

**Template**:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>

    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        window.mermaid = mermaid;
    </script>

    <!-- Minimal CSS -->
    <style>
        body {
            font-family: Georgia, serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 0 20px;
            line-height: 1.8;
            color: #333;
        }
        pre {
            background: #f5f5f5;
            padding: 12px;
            border-left: 3px solid #ccc;
            overflow-x: auto;
        }
        code {
            background: #f5f5f5;
            padding: 2px 4px;
            font-family: monospace;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        .mermaid {
            margin: 20px 0;
            text-align: center;
        }
        h1, h2, h3 {
            margin-top: 1.5em;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }
        table th, table td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: left;
        }
        table th {
            background: #f5f5f5;
        }
        blockquote {
            border-left: 3px solid #ccc;
            padding-left: 16px;
            color: #666;
            font-style: italic;
        }
    </style>
</head>
<body>
    <script type="text/plain" id="markdown-source">
{{MARKDOWN_CONTENT}}
    </script>
    <div id="content">Loading...</div>

    <script>
        document.addEventListener('DOMContentLoaded', async function() {
            try {
                const markdownSource = document.getElementById('markdown-source').textContent;
                const contentDiv = document.getElementById('content');

                marked.setOptions({ gfm: true, breaks: true });
                const htmlContent = marked.parse(markdownSource);
                contentDiv.innerHTML = htmlContent;

                const mermaidBlocks = contentDiv.querySelectorAll('code.language-mermaid');
                mermaidBlocks.forEach(block => {
                    const pre = block.parentElement;
                    const div = document.createElement('div');
                    div.className = 'mermaid';
                    div.textContent = block.textContent;
                    pre.replaceWith(div);
                });

                if (window.mermaid) {
                    await window.mermaid.run({ querySelector: '.mermaid' });
                }
            } catch (error) {
                document.getElementById('content').innerHTML =
                    '<p style="color: red;">Error: ' + error.message + '</p>';
            }
        });
    </script>
</body>
</html>
```

## Template Selection Guide

**Use Default (GitHub-Style)**:
- General documentation previews
- PR visualizations
- Technical reports
- Most common use case

**Use Dark Mode**:
- User requests dark theme
- Late-night work
- Presentations on dark backgrounds

**Use Minimal**:
- Simple documents without complex formatting
- Print-friendly output
- Lightweight previews

## Implementation Notes

**Template Usage in SKILL.md**:
1. Read appropriate template from TEMPLATES.md
2. Replace `{{TITLE}}` with actual title
3. Replace `{{MARKDOWN_CONTENT}}` with validated markdown
4. Write complete HTML to temp file
5. Open in browser

**Content Security Policy**:
- Allows CDN resources from jsdelivr.net
- Permits inline scripts for rendering logic
- Blocks external images (except data URIs)
- Prevents XSS attacks

**Library Versions**:
- Uses unpinned latest versions from CDN
- marked.js: Markdown parsing
- Prism.js: Syntax highlighting
- Mermaid.js: Diagram rendering

**Browser Compatibility**:
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- No IE11 support (uses ES6 modules)
