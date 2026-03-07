import { promises as fs } from "node:fs";
import path from "node:path";

import type { LoadedWorkspace, ScanOptions, WorkspaceFile } from "./types";
import { toPosixPath } from "./utils";

type WorkspaceLoadOptions = Pick<ScanOptions, "maxFileSizeBytes" | "maxFiles">;

const DEFAULT_OPTIONS: WorkspaceLoadOptions = {
  maxFileSizeBytes: 256_000,
  maxFiles: 500
};

const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "coverage",
  ".next",
  ".turbo"
]);

const ALWAYS_INCLUDE_BASENAMES = new Set([
  "package.json",
  "pyproject.toml",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "uv.lock",
  "poetry.lock",
  "requirements.txt",
  "README.md",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".npmrc"
]);

const ALWAYS_INCLUDE_RELATIVE = new Set([
  ".vscode/mcp.json",
  ".cursor/mcp.json",
  ".windsurf/mcp.json",
  "mcp.json",
  ".mcp.json"
]);

const PROMPTISH_NAME_PATTERNS = [/prompt/i, /tool/i, /resource/i, /instruction/i, /mcp/i];
const TEXT_EXTENSIONS = new Set([
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".md",
  ".txt",
  ".sh",
  ".ps1",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".py"
]);

export async function loadWorkspace(
  workspacePath: string,
  partialOptions: Partial<WorkspaceLoadOptions> = {}
): Promise<LoadedWorkspace> {
  const options: WorkspaceLoadOptions = { ...DEFAULT_OPTIONS, ...partialOptions };
  const absoluteWorkspace = path.resolve(workspacePath);
  const files: WorkspaceFile[] = [];

  await visitDirectory(absoluteWorkspace, absoluteWorkspace, files, options);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    workspacePath: absoluteWorkspace,
    files,
    fileMap: new Map(files.map((file) => [file.relativePath, file]))
  };
}

async function visitDirectory(
  rootPath: string,
  currentPath: string,
  files: WorkspaceFile[],
  options: WorkspaceLoadOptions
): Promise<void> {
  if (files.length >= options.maxFiles) {
    return;
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= options.maxFiles) {
      return;
    }

    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await visitDirectory(rootPath, absolutePath, files, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = toPosixPath(path.relative(rootPath, absolutePath));
    const basename = path.basename(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();

    if (!shouldIncludeFile(relativePath, basename, extension)) {
      continue;
    }

    const stat = await fs.stat(absolutePath);

    if (stat.size > options.maxFileSizeBytes) {
      continue;
    }

    const content = await fs.readFile(absolutePath, "utf8");
    files.push({
      filePath: absolutePath,
      relativePath,
      content,
      size: stat.size,
      basename,
      extension
    });
  }
}

function shouldIncludeFile(relativePath: string, basename: string, extension: string): boolean {
  if (ALWAYS_INCLUDE_RELATIVE.has(relativePath) || ALWAYS_INCLUDE_BASENAMES.has(basename)) {
    return true;
  }

  return TEXT_EXTENSIONS.has(extension) && PROMPTISH_NAME_PATTERNS.some((pattern) => pattern.test(basename));
}
