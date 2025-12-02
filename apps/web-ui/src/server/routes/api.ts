import { join, relative, extname, basename } from "path";
import { readdir, stat } from "fs/promises";
import { getProjectMetadata, formatProjectError, type Project } from "../project";
import { isLeft } from "../../lib/fp";

export interface FileNode {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  mimeType: string;
  frontmatter?: Record<string, unknown>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

export async function handleProjectRequest(
  projectPath: string
): Promise<Response> {
  const result = await getProjectMetadata(projectPath)();

  if (isLeft(result)) {
    return errorResponse(formatProjectError(result.left), 400);
  }

  return jsonResponse(result.right);
}

export async function handleFilesRequest(
  projectPath: string
): Promise<Response> {
  try {
    const rp1Path = join(projectPath, ".rp1");

    const sections: FileNode[] = [];

    const workPath = join(rp1Path, "work");
    const workTree = await buildFileTree(workPath, "work");
    if (workTree) {
      sections.push(workTree);
    }

    const contextPath = join(rp1Path, "context");
    const contextTree = await buildFileTree(contextPath, "context");
    if (contextTree) {
      sections.push(contextTree);
    }

    return jsonResponse(sections);
  } catch (error) {
    return errorResponse(`Failed to read file tree: ${String(error)}`);
  }
}

async function buildFileTree(
  dirPath: string,
  relativePath: string
): Promise<FileNode | null> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const children: FileNode[] = [];

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      const entryRelativePath = join(relativePath, entry.name);

      if (entry.isDirectory()) {
        const subTree = await buildFileTree(entryPath, entryRelativePath);
        if (subTree) {
          children.push(subTree);
        }
      } else if (entry.isFile()) {
        const fileStat = await stat(entryPath);
        children.push({
          path: entryRelativePath,
          name: entry.name,
          type: "file",
          size: fileStat.size,
          modifiedAt: fileStat.mtime?.toISOString(),
        });
      }
    }

    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      path: relativePath,
      name: basename(relativePath),
      type: "directory",
      children,
    };
  } catch {
    return null;
  }
}

export async function handleContentRequest(
  projectPath: string,
  filePath: string
): Promise<Response> {
  if (filePath.includes("..") || filePath.startsWith("/")) {
    return errorResponse("Invalid file path", 400);
  }

  const allowedPrefixes = ["work/", "context/"];
  if (!allowedPrefixes.some((prefix) => filePath.startsWith(prefix))) {
    return errorResponse("Access denied: path outside allowed directories", 403);
  }

  const fullPath = join(projectPath, ".rp1", filePath);

  try {
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      return errorResponse("File not found", 404);
    }

    const content = await file.text();
    const stat = await file.stat();
    const mimeType = getMimeType(filePath);

    let frontmatter: Record<string, unknown> | undefined;

    if (extname(filePath) === ".md") {
      const parsed = parseFrontmatter(content);
      frontmatter = parsed.frontmatter;
    }

    const response: FileContent = {
      path: filePath,
      content,
      mimeType,
      frontmatter,
    };

    return jsonResponse(response);
  } catch (error) {
    return errorResponse(`Failed to read file: ${String(error)}`);
  }
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".md": "text/markdown",
    ".json": "application/json",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
  };
  return mimeTypes[ext] ?? "text/plain";
}

function parseFrontmatter(content: string): {
  frontmatter?: Record<string, unknown>;
  content: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { content };
  }

  try {
    const yamlContent = match[1];
    const frontmatter: Record<string, unknown> = {};

    const lines = yamlContent.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }

    return {
      frontmatter,
      content: content.slice(match[0].length),
    };
  } catch {
    return { content };
  }
}
