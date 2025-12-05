import {
  File,
  FileText,
  FileJson,
  FileCode,
  Folder,
  FolderOpen,
  FileType,
  FileBox,
  Blocks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const extensionIconMap: Record<string, LucideIcon> = {
  ".md": FileText,
  ".json": FileJson,
  ".yaml": FileCode,
  ".yml": FileCode,
  ".ts": FileCode,
  ".tsx": FileCode,
  ".js": FileCode,
  ".jsx": FileCode,
  ".py": FileCode,
  ".rs": FileCode,
  ".go": FileCode,
  ".html": FileCode,
  ".css": FileCode,
  ".txt": FileType,
  ".log": FileType,
};

export function getFileIcon(name: string): LucideIcon {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return extensionIconMap[ext] ?? File;
}

export function getFolderIcon(isOpen: boolean): LucideIcon {
  return isOpen ? FolderOpen : Folder;
}

export { File, FileText, FileJson, FileCode, Folder, FolderOpen, FileType, FileBox, Blocks };
