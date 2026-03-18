import { ESLint } from "eslint";
import * as path from "path";
import * as fs from "fs";
import * as core from "@actions/core";
import _ from "lodash";
import { Issue, RunnerResult, issuesToConclusion } from "../types";

// файл ищет и раннит линтеры в репо
const LINT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export async function runLint(
  files: string[],
  configPath: string | null,
): Promise<RunnerResult> {
  const start = Date.now();

  // Только JS/TS файлы — Python и Java ESLint не поддерживает
  const lintable = files.filter((f) => LINT_EXTS.includes(path.extname(f)));

  if (lintable.length === 0) {
    core.info("lint-runner: no JS/TS files to lint");
    return emptyResult(Date.now() - start);
  }

  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();

  // Используем конфиг найденный detect'ом
  // Если конфига нет — ESLint запустится с дефолтными правилами
  const eslint = new ESLint({
    overrideConfigFile:
      configPath && fs.existsSync(configPath) ? configPath : undefined,
    allowInlineConfig: true,
    errorOnUnmatchedPattern: false,
  });

  let rawResults;
  try {
    rawResults = await eslint.lintFiles(lintable);
  } catch (err: any) {
    core.warning(`lint-runner: ESLint failed — ${err.message}`);
    return emptyResult(Date.now() - start);
  }

  const issues: Issue[] = _.chain(rawResults)
    .flatMap((result) =>
      result.messages.map((msg) => ({
        source: "eslint" as const,
        severity: (msg.severity === 2
          ? "error"
          : "warning") as Issue["severity"],
        file: path.relative(workspace, result.filePath),
        line: msg.line ?? 1,
        endLine: msg.endLine ?? msg.line ?? 1,
        col: msg.column ?? 1,
        rule: msg.ruleId ?? "unknown",
        message: msg.message,
        title: msg.ruleId ?? "ESLint",
      })),
    )
    .orderBy(["severity", "file", "line"], ["desc", "asc", "asc"])
    .value();

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  core.info(
    `lint-runner: ${errors} errors, ${warnings} warnings in ${Date.now() - start}ms`,
  );

  return {
    name: "tundra / eslint",
    issues,
    conclusion: issuesToConclusion(issues),
    meta: {
      filesScanned: lintable.length,
      durationMs: Date.now() - start,
    },
  };
}

function emptyResult(durationMs: number): RunnerResult {
  return {
    name: "tundra / eslint",
    issues: [],
    conclusion: "neutral",
    meta: {
      filesScanned: 0,
      durationMs,
    },
  };
}
