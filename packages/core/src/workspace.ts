import { promises as fs } from "node:fs";
import path from "node:path";

import type { LoadedWorkspace, ScanOptions, WorkspaceFile } from "./types";
import { toPosixPath } from "./utils";

type WorkspaceLoadOptions = Pick<ScanOptions, "focusFilePaths" | "maxFileSizeBytes" | "maxFiles">;

const DEFAULT_OPTIONS: WorkspaceLoadOptions = {
  maxFileSizeBytes: 256_000,
  maxFiles: 500
};

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".github",
  ".idea",
  "node_modules",
  "dist",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".venv",
  ".yarn",
  ".pnpm-store",
  ".cache",
  "__pycache__",
  "venv",
  "build",
  "tmp",
  "temp"
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
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".npmrc"
]);

const DISCOVERABLE_CONFIG_PATHS = [
  ".vscode/mcp.json",
  ".vscode/settings.json",
  ".cursor/mcp.json",
  ".cursor/settings.json",
  ".windsurf/mcp.json",
  ".windsurf/settings.json",
  "mcp.json",
  ".mcp.json"
];

const PROMPTISH_NAME_PATTERNS = [/prompt/i, /tool/i, /resource/i, /instruction/i, /mcp/i, /agent/i, /skill/i];
const PROMPTISH_PATH_SEGMENTS = new Set([
  "agent",
  "agents",
  "instruction",
  "instructions",
  "mcp",
  "prompt",
  "prompts",
  "resource",
  "resources",
  "skill",
  "skills",
  "tool",
  "tools"
]);
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
  ".py",
  ".code-workspace"
]);

export async function loadWorkspace(
  workspacePath: string,
  partialOptions: Partial<WorkspaceLoadOptions> = {}
): Promise<LoadedWorkspace> {
  const options: WorkspaceLoadOptions = { ...DEFAULT_OPTIONS, ...partialOptions };
  const absoluteWorkspace = path.resolve(workspacePath);
  const filesByRelativePath = new Map<string, WorkspaceFile>();
  const focusRelativePaths = normalizeFocusPaths(absoluteWorkspace, options.focusFilePaths);

  await loadDirectCandidates(absoluteWorkspace, filesByRelativePath, options, focusRelativePaths);

  if (focusRelativePaths.length === 0) {
    await visitDirectory(absoluteWorkspace, absoluteWorkspace, filesByRelativePath, options);
  }

  const files = [...filesByRelativePath.values()];
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
  filesByRelativePath: Map<string, WorkspaceFile>,
  options: WorkspaceLoadOptions
): Promise<void> {
  if (filesByRelativePath.size >= options.maxFiles) {
    return;
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (filesByRelativePath.size >= options.maxFiles) {
      return;
    }

    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await visitDirectory(rootPath, absolutePath, filesByRelativePath, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = toPosixPath(path.relative(rootPath, absolutePath));
    const basename = path.basename(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();

    if (filesByRelativePath.has(relativePath) || !shouldIncludeFile(relativePath, basename, extension)) {
      continue;
    }

    await addWorkspaceFile(rootPath, absolutePath, relativePath, filesByRelativePath, options);
  }
}

function shouldIncludeFile(relativePath: string, basename: string, extension: string): boolean {
  if (
    ALWAYS_INCLUDE_BASENAMES.has(basename) ||
    basename.endsWith(".code-workspace") ||
    isDiscoverableConfigPath(relativePath)
  ) {
    return true;
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    return false;
  }

  const pathSegments = relativePath.toLowerCase().split("/");
  return (
    PROMPTISH_NAME_PATTERNS.some((pattern) => pattern.test(basename)) ||
    pathSegments.some((segment) => PROMPTISH_PATH_SEGMENTS.has(segment))
  );
}

async function loadDirectCandidates(
  rootPath: string,
  filesByRelativePath: Map<string, WorkspaceFile>,
  options: WorkspaceLoadOptions,
  focusRelativePaths: string[]
): Promise<void> {
  const candidateRelativePaths = new Set<string>([
    ...ALWAYS_INCLUDE_BASENAMES,
    ...DISCOVERABLE_CONFIG_PATHS
  ]);

  for (const relativePath of focusRelativePaths) {
    candidateRelativePaths.add(relativePath);

    for (const directory of collectAncestorDirectories(relativePath)) {
      for (const configPath of DISCOVERABLE_CONFIG_PATHS) {
        candidateRelativePaths.add(joinRelativePath(directory, configPath));
      }
    }
  }

  for (const relativePath of await discoverWorkspaceFiles(rootPath, (entryName) =>
    entryName.endsWith(".code-workspace")
  )) {
    candidateRelativePaths.add(relativePath);
  }

  for (const relativePath of [...candidateRelativePaths].sort()) {
    if (filesByRelativePath.size >= options.maxFiles) {
      break;
    }

    const absolutePath = path.resolve(rootPath, relativePath);
    await addWorkspaceFile(rootPath, absolutePath, relativePath, filesByRelativePath, options);
  }
}

async function addWorkspaceFile(
  rootPath: string,
  absolutePath: string,
  relativePath: string,
  filesByRelativePath: Map<string, WorkspaceFile>,
  options: WorkspaceLoadOptions
): Promise<void> {
  if (filesByRelativePath.has(relativePath) || filesByRelativePath.size >= options.maxFiles) {
    return;
  }

  let stat;

  try {
    stat = await fs.stat(absolutePath);
  } catch {
    return;
  }

  if (!stat.isFile() || stat.size > options.maxFileSizeBytes) {
    return;
  }

  const basename = path.basename(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();

  if (!isLoadableTextFile(relativePath, basename, extension)) {
    return;
  }

  const content = await fs.readFile(absolutePath, "utf8");
  filesByRelativePath.set(relativePath, {
    filePath: absolutePath,
    relativePath,
    content,
    size: stat.size,
    basename,
    extension
  });
}

async function discoverWorkspaceFiles(
  rootPath: string,
  predicate: (entryName: string) => boolean
): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => toPosixPath(entry.name));
  } catch {
    return [];
  }
}

function normalizeFocusPaths(rootPath: string, focusFilePaths: string[] | undefined): string[] {
  if (!focusFilePaths || focusFilePaths.length === 0) {
    return [];
  }

  const relativePaths = new Set<string>();

  for (const focusFilePath of focusFilePaths) {
    const absolutePath = path.isAbsolute(focusFilePath)
      ? path.resolve(focusFilePath)
      : path.resolve(rootPath, focusFilePath);
    const relativePath = path.relative(rootPath, absolutePath);

    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      continue;
    }

    relativePaths.add(toPosixPath(relativePath));
  }

  return [...relativePaths];
}

function collectAncestorDirectories(relativePath: string): string[] {
  const directories = [""];
  let current = path.posix.dirname(relativePath);

  while (current && current !== ".") {
    directories.push(current);
    const parent = path.posix.dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return directories;
}

function joinRelativePath(directory: string, relativePath: string): string {
  return directory ? path.posix.join(directory, relativePath) : relativePath;
}

function isDiscoverableConfigPath(relativePath: string): boolean {
  return DISCOVERABLE_CONFIG_PATHS.some(
    (candidate) => relativePath === candidate || relativePath.endsWith(`/${candidate}`)
  );
}

function isLoadableTextFile(relativePath: string, basename: string, extension: string): boolean {
  return (
    ALWAYS_INCLUDE_BASENAMES.has(basename) ||
    basename.endsWith(".code-workspace") ||
    isDiscoverableConfigPath(relativePath) ||
    TEXT_EXTENSIONS.has(extension)
  );
}
