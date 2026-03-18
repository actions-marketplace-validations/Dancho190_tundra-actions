import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";

const SUPPORTED_EXTS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
];
const IGNORE_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
];

// получает список файлов для анализа
type Octokit = any;
type Context = any;

export async function getDiffFiles(
  octokit: Octokit,
  ctx: Context,
  workspace: string,
): Promise<string[]> {
  const pr = ctx.payload.pull_request;

  if (!pr) {
    core.warning("list-runner: not a PR — using getAllFiles");
    return getAllFiles(workspace);
  }

  const { data } = await octokit.rest.pulls.listFiles({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pr.number,
    per_page: 100,
  });

  const files = data
    .filter((f: any) => f.status !== "removed")
    .map((f: any) => f.filename)
    .filter((f: string) => SUPPORTED_EXTS.includes(path.extname(f)))
    .map((f: string) => path.join(workspace, f))
    .filter((f: string) => fs.existsSync(f));

  core.info(`list-runner [diff]: ${files.length} files`);
  return files;
}

export async function getAllFiles(workspace: string): Promise<string[]> {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (IGNORE_DIRS.includes(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (SUPPORTED_EXTS.includes(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }

  walk(workspace);
  core.info(`list-runner [full]: ${results.length} files`);
  return results;
}
