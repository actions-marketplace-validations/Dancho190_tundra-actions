import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import { execa } from "execa";
import _ from "lodash";
import {
  Issue,
  RunnerResult,
  issuesToConclusion,
  ProjectContext,
} from "../types";

interface CoverageSummary {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
}

interface TestMeta {
  filesScanned: number;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage?: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
    overall: number;
  };
}

// Главная функция
export async function runTests(ctx: ProjectContext): Promise<RunnerResult> {
  const start = Date.now();

  // Нет тест-раннера пропускаем
  if (!ctx.testRunner) {
    core.info("test-runner: no test runner detected, skipping");
    return neutralResult(Date.now() - start);
  }

  core.info(`test-runner: running ${ctx.testRunner}...`);

  // Запускаем тесты
  const { stdout, failed: testsFailed } = await runTestCommand(
    ctx.testRunner,
    ctx.workspace,
  );

  // Парсим результаты
  const parsed = parseTestOutput(ctx.testRunner, stdout);

  // Читаем coverage если есть
  const coverage = readCoverage(ctx.workspace);

  // Упавшие тесты → Issue[]
  const issues: Issue[] = parsed.failures.map((f) => ({
    source: "tundra" as const,
    severity: "error" as const,
    message: f.message,
    title: f.name,
    file: f.file,
    line: f.line,
  }));

  const durationMs = Date.now() - start;
  core.info(
    `test-runner: ${parsed.passed} passed, ${parsed.failed} failed in ${durationMs}ms`,
  );

  if (coverage) {
    core.info(`test-runner: coverage ${coverage.overall}%`);
  }

  const meta: TestMeta = {
    filesScanned: parsed.totalFiles,
    durationMs,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    ...(coverage ? { coverage } : {}),
  };

  return {
    name: "tundra / tests",
    issues,
    conclusion: issues.length > 0 ? "failure" : "success",
    meta,
  };
}

// Запуск тестов с execa, возвращаем stdout и флаг упавших тестов
async function runTestCommand(
  runner: "jest" | "vitest",
  workspace: string,
): Promise<{ stdout: string; failed: boolean }> {
  const commands = {
    jest: ["jest", ["--coverage", "--json", "--passWithNoTests"]],
    vitest: ["vitest", ["run", "--coverage", "--reporter=json"]],
  } as const;

  const [cmd, args] = commands[runner];

  try {
    const result = await execa("npx", [cmd, ...args], {
      cwd: workspace,
      timeout: 120_000, // 2 минуты максимум
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
      // Не бросаем ошибку если тесты упали — это нормально
      reject: false,
    });

    return { stdout: result.stdout, failed: result.exitCode !== 0 };
  } catch (err: any) {
    core.warning(`test-runner: command failed — ${err.message}`);
    return { stdout: "", failed: true };
  }
}

// Парсинг результатов
interface ParsedResults {
  passed: number;
  failed: number;
  skipped: number;
  totalFiles: number;
  failures: { name: string; message: string; file?: string; line?: number }[];
}

function parseTestOutput(
  runner: "jest" | "vitest",
  stdout: string,
): ParsedResults {
  if (!stdout.trim()) {
    return { passed: 0, failed: 0, skipped: 0, totalFiles: 0, failures: [] };
  }

  try {
    const json = JSON.parse(stdout);

    if (runner === "jest") {
      return parseJestOutput(json);
    } else {
      return parseVitestOutput(json);
    }
  } catch {
    core.warning("test-runner: failed to parse JSON output");
    return { passed: 0, failed: 0, skipped: 0, totalFiles: 0, failures: [] };
  }
}

// Jest --json формат
function parseJestOutput(json: any): ParsedResults {
  // Lodash sumBy — суммируем по всем test suite файлам
  const passed = _.sumBy(json.testResults ?? [], "numPassingTests");
  const failed = _.sumBy(json.testResults ?? [], "numFailingTests");
  const skipped = _.sumBy(json.testResults ?? [], "numPendingTests");

  // Упавшие тесты — flatMap всех suite → все тесты → только failed
  const failures = _.chain(json.testResults ?? [])
    .filter((suite: any) => suite.status === "failed")
    .flatMap((suite: any) =>
      (suite.testResults ?? [])
        .filter((t: any) => t.status === "failed")
        .map((t: any) => ({
          name: t.fullName ?? t.title,
          message: (t.failureMessages ?? [])[0] ?? "Test failed",
          file: suite.testFilePath
            ? path.relative(
                process.env.GITHUB_WORKSPACE ?? "",
                suite.testFilePath,
              )
            : undefined,
        })),
    )
    .value();

  return {
    passed,
    failed,
    skipped,
    totalFiles: (json.testResults ?? []).length,
    failures,
  };
}

// Vitest --reporter=json формат
function parseVitestOutput(json: any): ParsedResults {
  const files = json.testResults ?? json.files ?? [];

  const passed = _.sumBy(files, (f: any) => f.numPassingTests ?? 0);
  const failed = _.sumBy(files, (f: any) => f.numFailingTests ?? 0);
  const skipped = _.sumBy(files, (f: any) => f.numPendingTests ?? 0);

  const failures = _.chain(files)
    .flatMap((file: any) =>
      (file.testResults ?? [])
        .filter((t: any) => t.status === "fail" || t.status === "failed")
        .map((t: any) => ({
          name: t.fullName ?? t.name,
          message: (t.failureMessages ?? [])[0] ?? t.message ?? "Test failed",
          file: file.name
            ? path.relative(process.env.GITHUB_WORKSPACE ?? "", file.name)
            : undefined,
        })),
    )
    .value();

  return {
    passed,
    failed,
    skipped,
    totalFiles: files.length,
    failures,
  };
}

// ── Читаем coverage-summary.json ──────────────────────────
function readCoverage(workspace: string) {
  const summaryPath = path.join(workspace, "coverage", "coverage-summary.json");

  if (!fs.existsSync(summaryPath)) return null;

  try {
    const raw: Record<string, CoverageSummary["total"]> = JSON.parse(
      fs.readFileSync(summaryPath, "utf8"),
    );

    // coverage-summary.json содержит "total" ключ с общими числами
    const total = raw["total"];
    if (!total) return null;

    const overall = _.mean([
      total.lines.pct,
      total.statements.pct,
      total.functions.pct,
      total.branches.pct,
    ]);

    return {
      lines: total.lines.pct,
      statements: total.statements.pct,
      functions: total.functions.pct,
      branches: total.branches.pct,
      overall: Math.round(overall),
    };
  } catch {
    core.warning("test-runner: failed to read coverage-summary.json");
    return null;
  }
}

// ── Нейтральный результат если нет раннера ────────────────
function neutralResult(durationMs: number): RunnerResult {
  return {
    name: "tundra / tests",
    issues: [],
    conclusion: "neutral",
    meta: {
      filesScanned: 0,
      durationMs,
      passed: 0,
      failed: 0,
      skipped: 0,
    },
  };
}
