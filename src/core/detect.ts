import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import { ProjectContext } from "../types";

// ── Известные файлы ESLint конфигов ───────────────────────
const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "eslint.config.js", // flat config ESLint v9+
  "eslint.config.mjs",
  "eslint.config.cjs",
];

// ── Маппинг npm пакет → framework name для SDK ────────────
const FRAMEWORK_PACKAGES: Record<string, string> = {
  express: "express",
  "@nestjs/core": "nestjs",
  fastify: "fastify",
  koa: "koa",
  "@hapi/hapi": "hapi",
};

// ── Главная функция ────────────────────────────────────────
export async function detectProject(
  workspace: string,
): Promise<ProjectContext> {
  core.info("detect: scanning project structure...");

  const exists = (f: string) => fs.existsSync(path.join(workspace, f));

  // Все четыре детектора параллельно — быстрее
  const [eslintInfo, testInfo, frameworks, languages] = await Promise.all([
    detectESLint(workspace, exists),
    detectTestRunner(workspace, exists),
    detectFrameworks(workspace, exists),
    detectLanguages(workspace, exists),
  ]);

  const ctx: ProjectContext = {
    // ESLint
    hasESLintConfig: eslintInfo.hasConfig,
    eslintConfigPath: eslintInfo.configPath,

    // Tests
    hasTests: testInfo.hasTests,
    testRunner: testInfo.runner,
    hasCoverage: testInfo.hasCoverage,

    // Tundra SDK установлен у юзера?
    hasTundra: hasTundraInDeps(workspace),

    // Languages
    isTypeScript: languages.typescript,
    isPython: languages.python,
    isJava: languages.java,

    // Frameworks → передаём в tundra-runner
    frameworks,

    // Env
    workspace,
    repoUrl: `https://github.com/${process.env.GITHUB_REPOSITORY ?? "unknown/unknown"}`,
    branch:
      process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? "main",
  };

  // Логируем что нашли — видно в Actions логах
  core.info(
    `detect: eslint=${ctx.hasESLintConfig} (${eslintInfo.configPath ?? "none"})`,
  );
  core.info(
    `detect: tests=${ctx.testRunner ?? "none"} coverage=${ctx.hasCoverage}`,
  );
  core.info(
    `detect: ts=${ctx.isTypeScript} python=${ctx.isPython} java=${ctx.isJava}`,
  );
  core.info(`detect: frameworks=[${frameworks.join(", ") || "none"}]`);

  return ctx;
}

// ── 1. Детекция ESLint ─────────────────────────────────────
interface ESLintInfo {
  hasConfig: boolean;
  configPath: string | null;
}

async function detectESLint(
  workspace: string,
  exists: (f: string) => boolean,
): Promise<ESLintInfo> {
  for (const file of ESLINT_CONFIG_FILES) {
    if (exists(file)) {
      return { hasConfig: true, configPath: path.join(workspace, file) };
    }
  }

  // Поле "eslintConfig" в package.json (Create React App стиль)
  try {
    const pkgPath = path.join(workspace, "package.json");
    if (exists("package.json")) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.eslintConfig) {
        return { hasConfig: true, configPath: pkgPath };
      }
    }
  } catch {}

  return { hasConfig: false, configPath: null };
}

// ── 2. Детекция тест-раннера ───────────────────────────────
interface TestInfo {
  hasTests: boolean;
  runner: "vitest" | "jest" | null;
  hasCoverage: boolean;
}

async function detectTestRunner(
  workspace: string,
  exists: (f: string) => boolean,
): Promise<TestInfo> {
  // Vitest — приоритет (современнее)
  const hasVitest =
    exists("vitest.config.ts") ||
    exists("vitest.config.js") ||
    exists("vitest.config.mts");

  // Jest
  const hasJest =
    exists("jest.config.ts") ||
    exists("jest.config.js") ||
    exists("jest.config.json") ||
    exists("jest.config.cjs");

  // Проверяем scripts в package.json
  let hasTestScript = false;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(workspace, "package.json"), "utf8"),
    );
    const testScript = pkg.scripts?.test ?? "";
    // Дефолтный скрипт npm не считается
    hasTestScript =
      !!testScript &&
      !testScript.includes("no test specified") &&
      !testScript.includes("echo");

    // Vitest / Jest в dependencies тоже считается
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    if (deps.includes("vitest") && !hasVitest) {
      return {
        hasTests: true,
        runner: "vitest",
        hasCoverage:
          exists("coverage/coverage-summary.json") ||
          exists("coverage/lcov.info"),
      };
    }
    if (deps.includes("jest") && !hasJest) {
      return {
        hasTests: true,
        runner: "jest",
        hasCoverage:
          exists("coverage/coverage-summary.json") ||
          exists("coverage/lcov.info"),
      };
    }
  } catch {}

  const runner = hasVitest ? "vitest" : hasJest ? "jest" : null;
  const hasTests = !!runner || hasTestScript;

  // coverage/ папка появляется после прогона с --coverage
  const hasCoverage =
    exists("coverage/coverage-summary.json") || exists("coverage/lcov.info");

  return { hasTests, runner, hasCoverage };
}

// ── 3. Детекция фреймворков ────────────────────────────────
async function detectFrameworks(
  workspace: string,
  exists: (f: string) => boolean,
): Promise<string[]> {
  const found = new Set<string>();

  // Node.js / TypeScript — package.json
  if (exists("package.json")) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(workspace, "package.json"), "utf8"),
      );
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

      for (const [pkgName, framework] of Object.entries(FRAMEWORK_PACKAGES)) {
        if (deps.includes(pkgName)) found.add(framework);
      }
    } catch {
      core.warning("detect: failed to parse package.json for frameworks");
    }
  }

  // Python — requirements.txt
  if (exists("requirements.txt")) {
    try {
      const content = fs
        .readFileSync(path.join(workspace, "requirements.txt"), "utf8")
        .toLowerCase();
      if (content.includes("flask")) found.add("flask");
      if (content.includes("fastapi")) found.add("fastapi");
      if (content.includes("django")) found.add("django");
    } catch {}
  }

  // Java — pom.xml (Maven)
  if (exists("pom.xml")) {
    try {
      const content = fs
        .readFileSync(path.join(workspace, "pom.xml"), "utf8")
        .toLowerCase();
      if (content.includes("spring")) found.add("spring");
    } catch {}
  }

  // Java — build.gradle (Gradle)
  if (exists("build.gradle")) {
    try {
      const content = fs
        .readFileSync(path.join(workspace, "build.gradle"), "utf8")
        .toLowerCase();
      if (content.includes("spring")) found.add("spring");
    } catch {}
  }

  return Array.from(found);
}

// ── 4. Детекция языков ─────────────────────────────────────
interface Languages {
  typescript: boolean;
  python: boolean;
  java: boolean;
}

async function detectLanguages(
  workspace: string,
  exists: (f: string) => boolean,
): Promise<Languages> {
  const typescript = exists("tsconfig.json") || exists("tsconfig.base.json");

  const python =
    exists("requirements.txt") ||
    exists("setup.py") ||
    exists("pyproject.toml") ||
    hasFilesWithExt(workspace, ".py");

  const java =
    exists("pom.xml") ||
    exists("build.gradle") ||
    hasFilesWithExt(workspace, ".java");

  return { typescript, python, java };
}

// ── Есть ли tundra-sdk у юзера ────────────────────────────
function hasTundraInDeps(workspace: string): boolean {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(workspace, "package.json"), "utf8"),
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return "@dan321/tundra-sdk" in deps;
  } catch {
    return false;
  }
}

// ── Утилита: есть ли файлы с расширением (поверхностно) ───
function hasFilesWithExt(dir: string, ext: string, depth = 0): boolean {
  if (depth > 2) return false;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (["node_modules", "dist", "build", ".git"].includes(entry.name))
        continue;

      if (entry.isFile() && entry.name.endsWith(ext)) return true;
      if (entry.isDirectory()) {
        if (hasFilesWithExt(path.join(dir, entry.name), ext, depth + 1))
          return true;
      }
    }
  } catch {}
  return false;
}
